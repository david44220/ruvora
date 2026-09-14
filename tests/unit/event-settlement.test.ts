import { previewDistribution, finalizeDistribution } from "../../src/domains/economy/distribution";
import { describe, expect, it } from "vitest";
import {
  eventConfigurationSchema,
  previewEventSettlement,
  eventPrizeExposure,
  type EventSettlementInput,
  type SettlementPoint,
} from "../../src/domains/economy/event-settlement";
const at = "2026-09-01T12:00:00.000Z";
const configuration = eventConfigurationSchema.parse({
  version: "event-points-v2",
  pointRules: { QUALIFIED_VIEW: 15, CLICK: 5 },
  maxPointsPerUserPerDay: 100,
  participantCap: 20,
  allowedCountries: ["FR", "DE"],
  milestones: [{ points: 100, title: { en: "First century", fr: "Premier centenaire" } }],
  rewardTiers: [
    { fromRank: 1, toRank: 1, shareBps: 6000 },
    { fromRank: 2, toRank: 3, shareBps: 4000 },
  ],
  ruBonusBudgetMicros: "0",
  unusedFunds: "RETURN_SPONSOR",
});
const point = (
  userId: string,
  points: number,
  id = `point:${userId}`,
  occurredAt = at,
): SettlementPoint => ({
  id,
  eventId: "event",
  userId,
  activityId: `activity:${id}`,
  points,
  occurredAt,
  ruleVersion: configuration.version,
});
const input = (overrides: Partial<EventSettlementInput> = {}): EventSettlementInput => ({
  eventId: "event",
  ruleVersion: configuration.version,
  eligibilityPolicyVersion: "platform-policy-v1",
  configuration,
  prizeBudgetMinor: 1001n,
  fundedMinor: 1001n,
  pendingActivities: 0,
  participants: [
    { userId: "a", eligible: true, reasons: [] },
    { userId: "b", eligible: true, reasons: [] },
    { userId: "c", eligible: true, reasons: [] },
  ],
  entries: [point("a", 30), point("b", 20), point("c", 10)],
  ...overrides,
});
describe("funded event prize settlement", () => {
  it("apportions exact cents across disclosed tiers and records no RU", () => {
    const result = previewEventSettlement(input());
    expect(result.allocations.map((p) => [p.userId, p.rank, p.amountMinor])).toEqual([
      ["a", 1, 601n],
      ["b", 2, 200n],
      ["c", 3, 200n],
    ]);
    expect(result.awardedMinor).toBe(1001n);
    expect(result.refundMinor).toBe(0n);
    expect(result.ruBonusMicros).toBe(0n);
  });
  it("returns vacant rank slots rather than redistributing them to existing winners", () => {
    const result = previewEventSettlement(input({ entries: [point("a", 30), point("b", 20)] }));
    expect(result.awardedMinor).toBe(801n);
    expect(result.refundMinor).toBe(200n);
    expect(result.ranking.map((p) => p.userId)).toEqual(["a", "b"]);
  });
  it("returns every cent when no participant has validated points", () => {
    const result = previewEventSettlement(input({ entries: [] }));
    expect(result.allocations).toEqual([]);
    expect(result.refundMinor).toBe(1001n);
  });
  it("returns configured undistributed share and any excess funding", () => {
    const result = previewEventSettlement(
      input({
        fundedMinor: 1100n,
        configuration: {
          ...configuration,
          rewardTiers: [{ fromRank: 1, toRank: 1, shareBps: 5000 }],
        },
      }),
    );
    expect(result.awardedMinor).toBe(501n);
    expect(result.refundMinor).toBe(599n);
  });
  it("reranks eligible participants while retaining exclusion evidence", () => {
    const result = previewEventSettlement(
      input({
        participants: [
          { userId: "a", eligible: false, reasons: ["HOLD", "DISQUALIFIED"] },
          { userId: "b", eligible: true, reasons: [] },
          { userId: "c", eligible: true, reasons: [] },
        ],
      }),
    );
    expect(result.allocations.map((p) => [p.userId, p.amountMinor])).toEqual([
      ["b", 601n],
      ["c", 200n],
    ]);
    expect(result.excluded).toEqual([
      { userId: "a", eligible: false, reasons: ["DISQUALIFIED", "HOLD"] },
    ]);
    expect(result.refundMinor).toBe(200n);
  });
  it("breaks ties by earliest final score attainment then stable identifier", () => {
    const result = previewEventSettlement(
      input({
        entries: [
          point("b", 10),
          point("a", 10),
          point("c", 10, "late", "2026-09-01T12:01:00.000Z"),
        ],
      }),
    );
    expect(result.ranking.map((p) => p.userId)).toEqual(["a", "b", "c"]);
  });
  it("removes a fully reversed contribution before computing tie attainment", () => {
    const origin = point("a", 20, "reversed", "2026-09-01T12:01:00.000Z");
    const result = previewEventSettlement(
      input({
        entries: [
          point("a", 10),
          point("b", 10),
          origin,
          {
            ...origin,
            id: "correction",
            points: -20,
            occurredAt: "2026-09-02T12:01:00.000Z",
            reversalOf: origin.id,
          },
        ],
      }),
    );
    expect(result.ranking.map((p) => [p.userId, p.points, p.achievedAt])).toEqual([
      ["a", 10, at],
      ["b", 10, at],
    ]);
  });
  it("has a lossless order-independent immutable snapshot", () => {
    const first = previewEventSettlement(input());
    const second = previewEventSettlement(
      input({
        participants: [...input().participants].reverse(),
        entries: [...input().entries].reverse(),
        configuration: {
          ...configuration,
          allowedCountries: ["DE", "FR"],
          rewardTiers: [...configuration.rewardTiers].reverse(),
        },
      }),
    );
    expect(first.payload).toBe(second.payload);
    expect(Object.isFrozen(first.snapshot.configuration.rewardTiers)).toBe(true);
    expect(() => {
      (first.allocations as { amountMinor: bigint }[])[0]!.amountMinor = 999n;
    }).toThrow();
  });
  it("changes snapshot identity when platform eligibility policy changes", () => {
    expect(previewEventSettlement(input()).payload).not.toBe(
      previewEventSettlement(input({ eligibilityPolicyVersion: "platform-policy-v2" })).payload,
    );
  });
  it.each([0n, 1n, 2n, 3n, 99n, 100n, 101n, 999999999999999n, 90071992547409931234567n])(
    "conserves every minor unit for budget %s",
    (budget) => {
      const result = previewEventSettlement(
        input({ prizeBudgetMinor: budget, fundedMinor: budget }),
      );
      expect(result.awardedMinor + result.refundMinor).toBe(budget);
      expect(result.allocations.every((p) => p.amountMinor >= 0n)).toBe(true);
    },
  );
  it.each([1, 7, -1, NaN])(
    "blocks a nonzero/invalid pending review count %s",
    (pendingActivities) => {
      expect(() => previewEventSettlement(input({ pendingActivities }))).toThrow(
        "EVENT_PENDING_ACTIVITY",
      );
    },
  );
  it("rejects underfunding before calculating any winner liability", () => {
    expect(() => previewEventSettlement(input({ fundedMinor: 1000n }))).toThrow(
      "EVENT_UNDERFUNDED",
    );
  });
  it("rejects negative budgets and assets", () => {
    expect(() => previewEventSettlement(input({ prizeBudgetMinor: -1n }))).toThrow("prize budget");
    expect(() => previewEventSettlement(input({ fundedMinor: -1n }))).toThrow("funded prize");
  });
  it("rejects duplicate participants, duplicate sources, and nonmember points", () => {
    expect(() =>
      previewEventSettlement(
        input({ participants: [...input().participants, input().participants[0]!] }),
      ),
    ).toThrow("DUPLICATE_PARTICIPANT");
    expect(() =>
      previewEventSettlement(input({ entries: [point("a", 10), point("a", 10)] })),
    ).toThrow("DUPLICATE_POINT_ENTRY");
    expect(() => previewEventSettlement(input({ entries: [point("outsider", 10)] }))).toThrow(
      "EVENT_POINT_WITHOUT_MEMBERSHIP",
    );
  });
  it("rejects points from another event or frozen rules version", () => {
    expect(() =>
      previewEventSettlement(input({ entries: [{ ...point("a", 10), eventId: "another-event" }] })),
    ).toThrow("EVENT_SCOPE_MISMATCH");
    expect(() =>
      previewEventSettlement(
        input({ entries: [{ ...point("a", 10), ruleVersion: "old-version" }] }),
      ),
    ).toThrow("EVENT_POINT_VERSION_MISMATCH");
    expect(() => previewEventSettlement(input({ ruleVersion: "old-version" }))).toThrow(
      "EVENT_RULE_VERSION_MISMATCH",
    );
  });
  it("rejects orphan and partial point reversals", () => {
    const origin = point("a", 10);
    expect(() =>
      previewEventSettlement(
        input({ entries: [{ ...origin, id: "reversal", points: -10, reversalOf: "missing" }] }),
      ),
    ).toThrow("INVALID_POINT_REVERSAL");
    expect(() =>
      previewEventSettlement(
        input({
          entries: [origin, { ...origin, id: "reversal", points: -9, reversalOf: origin.id }],
        }),
      ),
    ).toThrow("INVALID_POINT_REVERSAL");
  });
  it.each([
    { ruBonusBudgetMicros: "1" },
    { unusedFunds: "RETAIN_PLATFORM" },
    {
      rewardTiers: [
        { fromRank: 1, toRank: 2, shareBps: 6000 },
        { fromRank: 2, toRank: 3, shareBps: 4000 },
      ],
    },
    {
      rewardTiers: [
        { fromRank: 1, toRank: 2, shareBps: 10000 },
        { fromRank: 3, toRank: 4, shareBps: 1 },
      ],
    },
    { rewardTiers: [{ fromRank: 2, toRank: 1, shareBps: 5000 }] },
    { rewardTiers: [{ fromRank: 1, toRank: 21, shareBps: 5000 }] },
    { allowedCountries: ["FR", "FR"] },
    { maxPointsPerUserPerDay: 0 },
  ])("rejects unsupported or ambiguous economic configuration %#", (change) => {
    expect(eventConfigurationSchema.safeParse({ ...configuration, ...change }).success).toBe(false);
  });
});
describe("event liabilities on a net revenue basis", () => {
  it("retains actual prize exposure inside a GDP snapshot that can finalize unchanged", () => {
    const positions = [{ eventId: "sponsored", obligationMinor: 10000n, fundedMinor: 10000n }];
    const exposure = { ...eventPrizeExposure(positions), positions };
    const preview = previewDistribution({
      periodId: "period",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-02T00:00:00.000Z",
      eligibleRevenueMinor: 1000n,
      eventPrizeExposure: exposure,
      rule: {
        version: "distribution-v1",
        poolBps: 10000,
        categoryWeightsBps: { USER: 10000, CREATOR: 0, ADVERTISER: 0, REFERRAL: 0 },
      },
      participants: [
        {
          userId: "user",
          category: "USER",
          amountMicros: 1000000n,
          eligible: true,
          unitIds: ["ru-validated"],
        },
      ],
      margin: {
        liabilities: { eventLiabilitiesMinor: exposure.unfundedLiabilityMinor },
        rule: {
          version: "margin-v1",
          minimumRetainedBps: 0,
          operatingReserveMinor: 0n,
          minimumOperatingProfitMinor: 0n,
          targetOperatingProfitMinor: 0n,
          mode: "REDUCE",
        },
      },
    });
    expect(preview.fundedPoolMinor).toBe(1000n);
    expect(preview.snapshot.eventPrizeExposure?.obligationMinor).toBe(10000n);
    const finalized = finalizeDistribution(preview, {
      id: "final",
      finalizedAt: "2026-09-03T00:00:00.000Z",
      idempotencyKey: "finalize-key",
      fundingAccountKey: "pool:global",
      availableFundingMinor: 1000n,
    });
    expect(finalized.transaction?.entries).toEqual([
      { accountKey: "pool:global", amountMinor: -1000n },
      { accountKey: "user:user", amountMinor: 1000n },
    ]);
  });
  it("does not double charge funded assets already excluded from revenue", () => {
    expect(
      eventPrizeExposure([{ eventId: "one", obligationMinor: 100000n, fundedMinor: 100000n }]),
    ).toEqual({
      obligationMinor: 100000n,
      earmarkedAssetsMinor: 100000n,
      unfundedLiabilityMinor: 0n,
    });
  });
  it("charges each unfunded event shortfall without using another event surplus", () => {
    expect(
      eventPrizeExposure([
        { eventId: "one", obligationMinor: 100n, fundedMinor: 75n },
        { eventId: "two", obligationMinor: 10n, fundedMinor: 35n },
      ]),
    ).toEqual({ obligationMinor: 110n, earmarkedAssetsMinor: 110n, unfundedLiabilityMinor: 25n });
  });
  it("rejects duplicate exposure and negative obligation", () => {
    expect(() =>
      eventPrizeExposure([
        { eventId: "one", obligationMinor: 1n, fundedMinor: 1n },
        { eventId: "one", obligationMinor: 1n, fundedMinor: 1n },
      ]),
    ).toThrow("DUPLICATE_EVENT_EXPOSURE");
    expect(() =>
      eventPrizeExposure([{ eventId: "one", obligationMinor: -1n, fundedMinor: 1n }]),
    ).toThrow();
  });
});
