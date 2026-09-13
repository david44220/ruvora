import { describe, expect, it } from "vitest";
import {
  allocateLargestRemainder,
  assertActivityTransition,
  assertIdempotency,
  assertSufficientBalances,
  buildBalancedTransaction,
  calculateActivityRewards,
  calculateReferralReward,
  canonicalPayload,
  computeEventScores,
  DEVELOPMENT_REWARD_RULE,
  deriveAccountBalance,
  DistributionInput,
  evaluateMarginGovernor,
  finalizeDistribution,
  MarginRule,
  previewDistribution,
  rankEventParticipants,
  reverseEventPoints,
  reverseRewardUnit,
  reverseTransaction,
  RewardUnitRecord,
  transitionRewardUnit,
  validateActivity,
} from "../../src/domains/economy";
import {
  evaluatePolicy,
  evaluatePersistedPolicy,
  PolicyRule,
  PolicySubject,
} from "../../src/domains/policy";

const at = "2026-09-13T12:00:00.000Z";
const marginRule: MarginRule = {
  version: "margin-1",
  minimumRetainedBps: 1000,
  operatingReserveMinor: 100n,
  minimumOperatingProfitMinor: 50n,
  targetOperatingProfitMinor: 60000n,
  mode: "REDUCE",
};
const distribution: DistributionInput = {
  periodId: "2026-08",
  startAt: "2026-08-01T00:00:00.000Z",
  endAt: "2026-09-01T00:00:00.000Z",
  eligibleRevenueMinor: 10000n,
  rule: {
    version: "distribution-1",
    poolBps: 5000,
    categoryWeightsBps: { USER: 4000, CREATOR: 3000, ADVERTISER: 2000, REFERRAL: 1000 },
  },
  participants: [
    { userId: "user-a", category: "USER", amountMicros: 1n, eligible: true, unitIds: ["ru-a"] },
    { userId: "user-b", category: "USER", amountMicros: 2n, eligible: true, unitIds: ["ru-b"] },
    { userId: "creator", category: "CREATOR", amountMicros: 5n, eligible: true, unitIds: ["ru-c"] },
    {
      userId: "advertiser",
      category: "ADVERTISER",
      amountMicros: 10n,
      eligible: true,
      unitIds: ["ru-d"],
    },
  ],
  margin: { rule: marginRule, liabilities: { providerFeesMinor: 100n, infrastructureMinor: 100n } },
};

describe("exact allocation", () => {
  it("conserves every cent with stable tie breaks independent of input order", () => {
    const input = [
      { key: "b", weight: 1n },
      { key: "a", weight: 1n },
      { key: "c", weight: 1n },
    ];
    expect(allocateLargestRemainder(5n, input)).toEqual({ a: 2n, b: 2n, c: 1n });
    expect(allocateLargestRemainder(5n, [...input].reverse())).toEqual(
      allocateLargestRemainder(5n, input),
    );
  });
  it("preserves exactness above Number.MAX_SAFE_INTEGER", () => {
    const total = 10n ** 30n + 2n;
    const shares = allocateLargestRemainder(total, [
      { key: "a", weight: 7n },
      { key: "b", weight: 3n },
    ]);
    expect(shares.a + shares.b).toBe(total);
    expect(shares.a).toBe(700000000000000000000000000001n);
  });
  it("holds invariants across uneven weights and totals", () => {
    for (let total = 0n; total < 200n; total++) {
      const shares = allocateLargestRemainder(total, [
        { key: "a", weight: 11n },
        { key: "b", weight: 7n },
        { key: "c", weight: 0n },
        { key: "d", weight: 4n },
      ]);
      expect(Object.values(shares).reduce((sum, value) => sum + value, 0n)).toBe(total);
      expect(shares.c).toBe(0n);
      for (const [key, weight] of [
        ["a", 11n],
        ["b", 7n],
        ["d", 4n],
      ] as const) {
        const floor = (total * weight) / 22n;
        expect(shares[key] === floor || shares[key] === floor + 1n).toBe(true);
      }
    }
  });
  it("rejects negative values, duplicates, and nonzero pools with no weight", () => {
    expect(() => allocateLargestRemainder(-1n, [])).toThrow("nonnegative bigint");
    expect(() => allocateLargestRemainder(1n, [{ key: "a", weight: 0n }])).toThrow(
      "NO_ALLOCATION_WEIGHT",
    );
    expect(() =>
      allocateLargestRemainder(1n, [
        { key: "a", weight: 1n },
        { key: "a", weight: 1n },
      ]),
    ).toThrow("DUPLICATE_ALLOCATION_KEY");
  });
  it("safely handles object prototype names as participant IDs", () => {
    expect(
      allocateLargestRemainder(2n, [
        { key: "__proto__", weight: 1n },
        { key: "constructor", weight: 1n },
      ])["__proto__"],
    ).toBe(1n);
  });
});

describe("ledger integrity and idempotency", () => {
  const input = {
    id: "tx-1",
    idempotencyKey: "fund-1",
    reference: "development-funding-1",
    occurredAt: at,
    entries: [
      { accountKey: "clearing:development", amountMinor: -1000n },
      { accountKey: "campaign:one", amountMinor: 1000n },
    ],
  };
  it("creates immutable balanced transactions and derives balances from entries", () => {
    const tx = buildBalancedTransaction(input);
    expect(tx.entries.reduce((sum, entry) => sum + entry.amountMinor, 0n)).toBe(0n);
    expect(deriveAccountBalance([tx], "campaign:one")).toBe(1000n);
    expect(Object.isFrozen(tx.entries[0])).toBe(true);
    expect(Object.isFrozen(input.entries[0])).toBe(false);
  });
  it("rejects unbalanced, zero, duplicate-account and empty postings", () => {
    expect(() =>
      buildBalancedTransaction({
        ...input,
        entries: [
          { accountKey: "a", amountMinor: 3n },
          { accountKey: "b", amountMinor: -2n },
        ],
      }),
    ).toThrow("UNBALANCED_TRANSACTION");
    expect(() => buildBalancedTransaction({ ...input, entries: [] })).toThrow(
      "INSUFFICIENT_POSTINGS",
    );
    expect(() =>
      buildBalancedTransaction({
        ...input,
        entries: [
          { accountKey: "a", amountMinor: 0n },
          { accountKey: "b", amountMinor: 0n },
        ],
      }),
    ).toThrow("INVALID_POSTING_AMOUNT");
    expect(() =>
      buildBalancedTransaction({
        ...input,
        entries: [
          { accountKey: "a", amountMinor: 2n },
          { accountKey: "a", amountMinor: -2n },
        ],
      }),
    ).toThrow("DUPLICATE_POSTING_ACCOUNT");
  });
  it("blocks protected account overdrafts", () => {
    const tx = buildBalancedTransaction({
      ...input,
      entries: [
        { accountKey: "campaign:one", amountMinor: -100n },
        { accountKey: "platform:revenue", amountMinor: 100n },
      ],
    });
    expect(() => assertSufficientBalances(tx, { "campaign:one": 99n }, ["campaign:one"])).toThrow(
      "campaign:one",
    );
    expect(() =>
      assertSufficientBalances(tx, { "campaign:one": 100n }, ["campaign:one"]),
    ).not.toThrow();
  });
  it("reverses by compensating postings and rejects repeated reversal", () => {
    const original = buildBalancedTransaction(input);
    const reversalInput = {
      id: "rev-1",
      idempotencyKey: "reverse-1",
      occurredAt: at,
      reason: "validated refund",
    };
    const reversal = reverseTransaction(original, reversalInput);
    expect(deriveAccountBalance([original, reversal], "campaign:one")).toBe(0n);
    expect(original.entries[1].amountMinor).toBe(1000n);
    expect(reversal.reversalOf).toBe(original.id);
    expect(() => reverseTransaction(original, reversalInput, true)).toThrow("ALREADY_REVERSED");
    expect(() => reverseTransaction(reversal, reversalInput)).toThrow("ALREADY_REVERSED");
  });
  it("checks idempotent payload equality losslessly, including bigint and key order", () => {
    const payload = canonicalPayload({ amount: 10n ** 20n, campaign: "one" });
    expect(() => assertIdempotency(payload, { campaign: "one", amount: 10n ** 20n })).not.toThrow();
    expect(() => assertIdempotency(payload, { campaign: "two", amount: 10n ** 20n })).toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
    expect(() => canonicalPayload({ amount: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      "UNSAFE_PAYLOAD_NUMBER",
    );
  });
});

describe("margin governor", () => {
  it("subtracts all liability classes before distributing", () => {
    const liabilities = {
      providerFeesMinor: 1n,
      taxLiabilityMinor: 2n,
      refundsMinor: 3n,
      chargebacksMinor: 4n,
      fraudLossesMinor: 5n,
      campaignLiabilitiesMinor: 6n,
      userRewardsMinor: 7n,
      creatorRewardsMinor: 8n,
      advertiserRewardsMinor: 9n,
      referralAllocationsMinor: 10n,
      eventLiabilitiesMinor: 11n,
      prizePoolsMinor: 12n,
      infrastructureMinor: 13n,
      otherOperatingCostsMinor: 14n,
    };
    const decision = evaluateMarginGovernor({
      grossEligibleRevenueMinor: 1000n,
      requestedPoolMinor: 900n,
      liabilities,
      rule: marginRule,
    });
    expect(decision.liabilitiesMinor).toBe(105n);
    expect(decision.allowedPoolMinor).toBe(695n);
    expect(decision.status).toBe("REDUCED");
    expect(decision.estimatedOperatingProfitMinor).toBe(200n);
  });
  it("blocks rather than reduces when configured", () => {
    const decision = evaluateMarginGovernor({
      grossEligibleRevenueMinor: 1000n,
      requestedPoolMinor: 900n,
      liabilities: {},
      rule: { ...marginRule, mode: "BLOCK" },
    });
    expect(decision.allowedPoolMinor).toBe(0n);
    expect(decision.status).toBe("BLOCKED");
  });
  it("rounds retained floors up and never creates negative distributions", () => {
    const decision = evaluateMarginGovernor({
      grossEligibleRevenueMinor: 3n,
      requestedPoolMinor: 3n,
      liabilities: {},
      rule: {
        ...marginRule,
        minimumRetainedBps: 1,
        minimumOperatingProfitMinor: 0n,
        operatingReserveMinor: 0n,
      },
    });
    expect(decision.requiredRetainedMinor).toBe(1n);
    expect(decision.allowedPoolMinor).toBe(2n);
    expect(
      evaluateMarginGovernor({
        grossEligibleRevenueMinor: 1n,
        requestedPoolMinor: 1n,
        liabilities: { refundsMinor: 2n },
        rule: marginRule,
      }).allowedPoolMinor,
    ).toBe(0n);
  });
  it("rejects invalid rule percentages, negative costs and unknown liabilities", () => {
    const input = {
      grossEligibleRevenueMinor: 100n,
      requestedPoolMinor: 20n,
      liabilities: {},
      rule: marginRule,
    };
    expect(() =>
      evaluateMarginGovernor({ ...input, rule: { ...marginRule, minimumRetainedBps: 10001 } }),
    ).toThrow();
    expect(() =>
      evaluateMarginGovernor({ ...input, liabilities: { providerFeesMinor: -1n } }),
    ).toThrow();
    expect(() =>
      evaluateMarginGovernor({ ...input, liabilities: { forgottenCost: 1n } as never }),
    ).toThrow("forgottenCost");
  });
});

describe("revenue distribution snapshots", () => {
  it("allocates category shares separately and retains empty category money", () => {
    const preview = previewDistribution(distribution);
    expect(preview.fundedPoolMinor).toBe(5000n);
    expect(preview.distributedMinor).toBe(4500n);
    expect(preview.undistributedMinor).toBe(500n);
    expect(preview.allocations.map((item) => item.amountMinor)).toEqual([
      667n,
      1333n,
      1500n,
      1000n,
    ]);
    expect(Object.isFrozen(preview.snapshot.rule.categoryWeightsBps)).toBe(true);
  });
  it("snapshots held users but excludes their rewards and consumption", () => {
    const preview = previewDistribution({
      ...distribution,
      participants: distribution.participants.map((participant) =>
        participant.userId === "user-b"
          ? { ...participant, eligible: false, eligibilityReasons: ["ECONOMIC_HOLD"] }
          : participant,
      ),
    });
    expect(preview.allocations.find((item) => item.userId === "user-a")?.amountMinor).toBe(2000n);
    expect(preview.allocations.some((item) => item.userId === "user-b")).toBe(false);
    const result = finalizeDistribution(preview, {
      id: "final-1",
      finalizedAt: at,
      idempotencyKey: "final-1",
      fundingAccountKey: "pool:global",
      availableFundingMinor: 4500n,
    });
    expect(result.consumedUnitIds).not.toContain("ru-b");
  });
  it("never lets later rule changes alter a historical preview", () => {
    const config = {
      ...distribution,
      rule: {
        ...distribution.rule,
        categoryWeightsBps: { ...distribution.rule.categoryWeightsBps },
      },
    };
    const preview = previewDistribution(config);
    config.rule.categoryWeightsBps.USER = 1000;
    expect(preview.snapshot.rule.categoryWeightsBps.USER).toBe(4000);
    expect(preview.ruleVersion).toBe("distribution-1");
  });
  it("is deterministic for reordered participants and unit IDs", () => {
    expect(
      previewDistribution({
        ...distribution,
        participants: [...distribution.participants].reverse(),
      }).payload,
    ).toBe(previewDistribution(distribution).payload);
  });
  it("rejects duplicate units, duplicate participant categories and invalid weights", () => {
    expect(() =>
      previewDistribution({
        ...distribution,
        participants: [...distribution.participants, distribution.participants[0]],
      }),
    ).toThrow("DUPLICATE_PARTICIPANT_CATEGORY");
    expect(() =>
      previewDistribution({
        ...distribution,
        participants: [
          { ...distribution.participants[0], unitIds: ["same"] },
          { ...distribution.participants[1], unitIds: ["same"] },
        ],
      }),
    ).toThrow("DUPLICATE_REWARD_UNIT");
    expect(() =>
      previewDistribution({
        ...distribution,
        rule: {
          ...distribution.rule,
          categoryWeightsBps: { ...distribution.rule.categoryWeightsBps, USER: 9999 },
        },
      }),
    ).toThrow("CATEGORY_WEIGHTS_MUST_SUM_TO_10000");
  });
  it("finalizes balanced postings, consumes only snapshot units, and blocks underfunding", () => {
    const preview = previewDistribution(distribution);
    const input = {
      id: "final-1",
      finalizedAt: at,
      idempotencyKey: "final-1",
      fundingAccountKey: "pool:global",
      availableFundingMinor: 4500n,
    };
    const result = finalizeDistribution(preview, input);
    expect(result.transaction?.entries.reduce((sum, entry) => sum + entry.amountMinor, 0n)).toBe(
      0n,
    );
    expect(result.consumedUnitIds).toEqual(["ru-a", "ru-b", "ru-c", "ru-d"]);
    expect(() => finalizeDistribution(preview, { ...input, availableFundingMinor: 4499n })).toThrow(
      "INSUFFICIENT_DISTRIBUTION_FUNDING",
    );
    expect(() => finalizeDistribution(preview, { ...input, alreadyFinalized: true })).toThrow(
      "PERIOD_ALREADY_FINALIZED",
    );
    expect(() =>
      finalizeDistribution(preview, { ...input, finalizedAt: "2026-08-31T00:00:00.000Z" }),
    ).toThrow("PERIOD_NOT_ENDED");
  });
  it("detects preview tampering before posting", () => {
    const preview = previewDistribution(distribution);
    expect(() =>
      finalizeDistribution(
        { ...preview, distributedMinor: 1n },
        {
          id: "final",
          finalizedAt: at,
          idempotencyKey: "final",
          fundingAccountKey: "pool",
          availableFundingMinor: 9999n,
        },
      ),
    ).toThrow("PREVIEW_TAMPERED");
  });
  it("aggregates multi-role recipients to one posting without mixing RU categories", () => {
    const preview = previewDistribution({
      ...distribution,
      participants: distribution.participants.map((participant) =>
        participant.category === "CREATOR" ? { ...participant, userId: "user-a" } : participant,
      ),
    });
    const result = finalizeDistribution(preview, {
      id: "multi",
      finalizedAt: at,
      idempotencyKey: "multi",
      fundingAccountKey: "pool",
      availableFundingMinor: 4500n,
    });
    expect(
      result.transaction?.entries.find((entry) => entry.accountKey === "user:user-a")?.amountMinor,
    ).toBe(2167n);
  });
});

describe("validated advertising activity", () => {
  const signals = {
    participantId: "user",
    advertiserId: "advertiser",
    authenticated: true,
    policyAllowed: true,
    campaignStatus: "ACTIVE",
    type: "QUALIFIED_VIEW" as const,
    allowedTypes: ["QUALIFIED_VIEW", "CONVERSION"] as const,
    occurredAt: at,
    campaignStartAt: "2026-09-01T00:00:00.000Z",
    campaignEndAt: "2026-10-01T00:00:00.000Z",
    duplicate: false,
    priorActivityCount: 0,
    frequencyCap: 3,
    billableMinor: 25n,
    remainingBudgetMinor: 100n,
    dailyRemainingMinor: 50n,
    riskScore: 0,
    reviewThreshold: 50,
  };
  const activity = {
    activityId: "activity",
    participantId: "user",
    advertiserId: "advertiser",
    creatorId: "creator",
    eventId: "event",
    type: "QUALIFIED_VIEW" as const,
    state: "VALIDATED" as const,
    billableMinor: 25n,
  };
  it("issues distinct USER, CREATOR and ADVERTISER RU plus independent XP and Event Points", () => {
    expect(validateActivity(signals).state).toBe("VALIDATED");
    const rewards = calculateActivityRewards(activity);
    expect(rewards.units.map((unit) => [unit.category, unit.amountMicros])).toEqual([
      ["USER", 250000n],
      ["CREATOR", 100000n],
      ["ADVERTISER", 500000n],
    ]);
    expect(rewards.xp.amount).toBe(40);
    expect(rewards.eventPoints?.amount).toBe(15);
    expect(rewards.units.every((unit) => unit.activityId === activity.activityId)).toBe(true);
  });
  it.each(["RECEIVED", "PENDING_VALIDATION", "REJECTED", "REVERSED"] as const)(
    "gives no final RU, XP or points to %s activity",
    (state) => {
      const rewards = calculateActivityRewards({ ...activity, state });
      expect(rewards.units).toEqual([]);
      expect(rewards.xp.amount).toBe(0);
      expect(rewards.eventPoints).toBeUndefined();
    },
  );
  it("never rewards deposit-like, zero-billable, unknown or self activity", () => {
    expect(calculateActivityRewards({ ...activity, billableMinor: 0n }).units).toEqual([]);
    expect(calculateActivityRewards({ ...activity, type: "DEPOSIT" as never }).units).toEqual([]);
    expect(calculateActivityRewards({ ...activity, participantId: "advertiser" }).units).toEqual(
      [],
    );
  });
  it.each([
    [{ duplicate: true }, "DUPLICATE_ACTIVITY"],
    [{ participantId: "advertiser" }, "SELF_PARTICIPATION"],
    [{ remainingBudgetMinor: 24n }, "CAMPAIGN_BUDGET_EXCEEDED"],
    [{ dailyRemainingMinor: 24n }, "CAMPAIGN_BUDGET_EXCEEDED"],
    [{ priorActivityCount: 3 }, "FREQUENCY_CAP"],
    [{ policyAllowed: false }, "POLICY_INELIGIBLE"],
    [{ occurredAt: "2026-10-01T00:00:00.000Z" }, "OUTSIDE_CAMPAIGN_WINDOW"],
    [{ type: "CONVERSION" }, "CONVERSION_EVIDENCE_REQUIRED"],
  ])("rejects disallowed activity signals case %#", (override, reason) => {
    const result = validateActivity({ ...signals, ...override } as typeof signals);
    expect(result.state).toBe("REJECTED");
    expect(result.reasons).toContain(reason);
  });
  it("holds risk for review without rewarding pending activity", () => {
    expect(validateActivity({ ...signals, riskScore: 50 })).toEqual({
      state: "PENDING_VALIDATION",
      reasons: ["RISK_REVIEW_REQUIRED"],
    });
  });
  it("supports versioned rates and rejects unsafe progression values", () => {
    const rate = DEVELOPMENT_REWARD_RULE.rates.QUALIFIED_VIEW!;
    expect(
      calculateActivityRewards(activity, {
        version: "new-rule",
        rates: { QUALIFIED_VIEW: { ...rate, userRuMicros: 1n } },
      }).units[0].ruleVersion,
    ).toBe("new-rule");
    expect(() =>
      calculateActivityRewards(activity, {
        version: "bad",
        rates: { QUALIFIED_VIEW: { ...rate, xp: 1.5 } },
      }),
    ).toThrow("xp");
  });
  it("enforces append-only activity state transitions", () => {
    expect(() => assertActivityTransition("PENDING_VALIDATION", "VALIDATED")).not.toThrow();
    expect(() => assertActivityTransition("REVERSED", "VALIDATED")).toThrow();
    expect(() => assertActivityTransition("RECEIVED", "VALIDATED")).toThrow();
  });
});

describe("reward unit lifecycle", () => {
  const unit: RewardUnitRecord = {
    id: "ru-1",
    userId: "user",
    activityId: "activity",
    category: "USER",
    amountMicros: 250000n,
    state: "VALIDATED",
    ruleVersion: "v1",
  };
  it("only consumes validated RU with a final distribution reference", () => {
    expect(
      transitionRewardUnit(unit, "CONSUMED", "period finalized", "distribution-1").distributionId,
    ).toBe("distribution-1");
    expect(() => transitionRewardUnit(unit, "CONSUMED", "period finalized")).toThrow();
    expect(() =>
      transitionRewardUnit({ ...unit, state: "REJECTED" }, "CONSUMED", "invalid", "distribution-1"),
    ).toThrow("REJECTED -> CONSUMED");
  });
  it("reverses unconsumed units and creates an economic review for consumed units", () => {
    expect(reverseRewardUnit(unit, "invalid traffic").kind).toBe("REVERSE");
    const consumed = { ...unit, state: "CONSUMED" as const, distributionId: "distribution-1" };
    expect(reverseRewardUnit(consumed, "invalid traffic")).toMatchObject({
      kind: "POST_FINALIZATION_REVIEW",
      economicHoldRequired: true,
    });
    expect(consumed.state).toBe("CONSUMED");
  });
});

describe("event points and rankings", () => {
  const entry = {
    id: "point-1",
    userId: "a",
    activityId: "act-1",
    eventId: "event",
    points: 15,
    occurredAt: at,
  };
  it("uses score then attainment then stable participant ID", () => {
    const scores = [
      { userId: "c", points: 15, achievedAt: at },
      { userId: "b", points: 15, achievedAt: "2026-09-12T00:00:00.000Z" },
      { userId: "a", points: 15, achievedAt: at },
      { userId: "d", points: 16, achievedAt: at },
    ];
    expect(rankEventParticipants(scores).map((item) => [item.userId, item.rank])).toEqual([
      ["d", 1],
      ["b", 2],
      ["a", 3],
      ["c", 4],
    ]);
    expect(rankEventParticipants([...scores].reverse())).toEqual(rankEventParticipants(scores));
  });
  it("reverses the exact underlying contribution without deleting history", () => {
    const reversal = reverseEventPoints(entry, { id: "rev", occurredAt: at });
    expect(computeEventScores("event", [entry, reversal])).toEqual([]);
    expect(entry.points).toBe(15);
    expect(() =>
      computeEventScores("event", [entry, reversal, { ...reversal, id: "rev-2" }]),
    ).toThrow("DUPLICATE_POINT_REVERSAL");
  });
  it("rejects another event's scores and duplicate activity awards", () => {
    expect(() => computeEventScores("other", [entry])).toThrow("EVENT_SCOPE_MISMATCH");
    expect(() => computeEventScores("event", [entry, { ...entry, id: "point-2" }])).toThrow(
      "DUPLICATE_ACTIVITY_POINTS",
    );
  });
  it("rejects unbalanced point reversals and overflow", () => {
    expect(() =>
      computeEventScores("event", [
        entry,
        { ...entry, id: "rev", points: -14, reversalOf: entry.id },
      ]),
    ).toThrow("INVALID_POINT_REVERSAL");
    expect(() =>
      computeEventScores("event", [
        { ...entry, points: Number.MAX_SAFE_INTEGER },
        { ...entry, id: "point-2", activityId: "act-2", points: 1 },
      ]),
    ).toThrow("total event points");
  });
});

describe("bounded one-level referrals", () => {
  const rule = {
    version: "referral-1",
    rewardBps: 1000,
    maxRewardPerActivityMicros: 100000n,
    maxRewardPerReferrerPeriodMicros: 500000n,
    maxQualifyingRefereesPerPeriod: 10,
  };
  const input = {
    referrerId: "referrer",
    refereeId: "referee",
    activityId: "activity",
    sourceCategory: "USER" as const,
    sourceRuMicros: 1000000n,
    sourceValidated: true,
    policyAllowed: true,
    sharedVerifiedIdentity: false,
    alreadyRewarded: false,
    earnedThisPeriodMicros: 450000n,
    qualifyingRefereesThisPeriod: 3,
    refereeAlreadyQualifiedThisPeriod: false,
  };
  it("caps an award to remaining period capacity", () => {
    expect(calculateReferralReward(input, rule).amountMicros).toBe(50000n);
  });
  it.each([
    [{ referrerId: "referee" }, "SELF_REFERRAL"],
    [{ sharedVerifiedIdentity: true }, "SELF_REFERRAL"],
    [{ sourceValidated: false }, "VALIDATED_SOURCE_REQUIRED"],
    [{ sourceCategory: "REFERRAL" }, "MULTILEVEL_REFERRAL_DISALLOWED"],
    [{ alreadyRewarded: true }, "DUPLICATE_REFERRAL_REWARD"],
    [{ qualifyingRefereesThisPeriod: 10 }, "REFERRAL_COUNT_CAP"],
  ])("rejects ineligible referral case %#", (override, reason) => {
    const reward = calculateReferralReward({ ...input, ...override } as typeof input, rule);
    expect(reward.amountMicros).toBe(0n);
    expect(reward.reasons).toContain(reason);
  });
});

describe("central policy gates", () => {
  const rule: PolicyRule = {
    version: "policy-1",
    minimumAge: 18,
    allowedCountries: ["FR"],
    blockedRegions: [],
    minimumCreatorFollowers: 10,
    requireCreatorReview: false,
    requireAdvertiserReview: true,
    requireKycForPayout: true,
    requireKybForAdvertising: true,
    paymentProviderCountries: [],
    enabledFeatures: [
      "PUBLIC_PROFILE",
      "PARTICIPATE",
      "CREATOR_MONETIZATION",
      "ADVERTISE",
      "EVENT_JOIN",
      "DISTRIBUTION",
      "PAYOUT",
      "ADMINISTRATION",
    ],
  };
  const subject: PolicySubject = {
    id: "user",
    roles: ["USER", "CREATOR", "ADVERTISER"],
    country: "FR",
    birthDate: "2000-09-13",
    suspended: false,
    economicHold: false,
    creatorFollowerCount: 10,
  };
  it("supports role combinations and the configurable nano creator threshold", () => {
    expect(evaluatePolicy(subject, "CREATOR_MONETIZATION", rule, at).allowed).toBe(true);
    expect(evaluatePolicy(subject, "ADMINISTRATION", rule, at).reasons).toContain("ROLE_REQUIRED");
    expect(
      evaluatePolicy({ ...subject, creatorFollowerCount: 9 }, "CREATOR_MONETIZATION", rule, at)
        .reasons,
    ).toContain("CREATOR_THRESHOLD");
  });
  it("checks exact birthdays and rejects malformed or future dates", () => {
    expect(
      evaluatePolicy({ ...subject, birthDate: "2008-09-13" }, "PARTICIPATE", rule, at).allowed,
    ).toBe(true);
    expect(
      evaluatePolicy({ ...subject, birthDate: "2008-09-14" }, "PARTICIPATE", rule, at).reasons,
    ).toContain("MINIMUM_AGE");
    for (const birthDate of [null, "2000-02-30", "2030-01-01"])
      expect(evaluatePolicy({ ...subject, birthDate }, "PARTICIPATE", rule, at).reasons).toContain(
        "AGE_UNVERIFIED",
      );
  });
  it("fails closed for missing geography, disabled features and economic holds", () => {
    expect(
      evaluatePolicy({ ...subject, country: null }, "DISTRIBUTION", rule, at).reasons,
    ).toContain("COUNTRY_UNAVAILABLE");
    expect(
      evaluatePolicy({ ...subject, economicHold: true }, "DISTRIBUTION", rule, at).reasons,
    ).toContain("ECONOMIC_HOLD");
    expect(
      evaluatePolicy(subject, "EVENT_JOIN", { ...rule, enabledFeatures: [] }, at).reasons,
    ).toContain("FEATURE_DISABLED");
  });
  it("requires configured review and KYB and never invents provider availability", () => {
    expect(evaluatePolicy(subject, "ADVERTISE", rule, at).reasons).toEqual([
      "ADVERTISER_REVIEW_REQUIRED",
      "KYB_REQUIRED",
    ]);
    expect(evaluatePolicy({ ...subject, kycVerified: true }, "PAYOUT", rule, at).reasons).toEqual([
      "PAYMENT_PROVIDER_UNAVAILABLE",
    ]);
  });
});

describe("persisted policy adapter", () => {
  const subject = {
    onboarded: true,
    ageEligible: true,
    termsAcceptedAt: new Date(at),
    country: "FR",
    suspended: false,
    economicHold: false,
    roles: ["USER", "CREATOR"],
    followers: 10,
  };
  const rule = { allowedCountries: ["FR"], creatorFollowerThreshold: 10 };
  it("allows an eligible multi-role account without claiming verified DOB", () => {
    expect(evaluatePersistedPolicy(subject, "CREATOR_MONETIZATION", rule)).toEqual({
      eligible: true,
      reasons: [],
    });
  });
  it("fails closed on missing attestation, terms, onboarding, country or holds", () => {
    const decision = evaluatePersistedPolicy(
      {
        ...subject,
        onboarded: false,
        ageEligible: false,
        termsAcceptedAt: null,
        country: null,
        economicHold: true,
      },
      "DISTRIBUTION",
      rule,
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toEqual([
      "ONBOARDING_REQUIRED",
      "ADULT_ATTESTATION_REQUIRED",
      "TERMS_ACCEPTANCE_REQUIRED",
      "COUNTRY_UNAVAILABLE",
      "ECONOMIC_HOLD",
    ]);
  });
  it("requires the creator role and threshold independently", () => {
    expect(
      evaluatePersistedPolicy(
        { ...subject, roles: ["USER"], followers: 9 },
        "CREATOR_MONETIZATION",
        rule,
      ).reasons,
    ).toEqual(["CREATOR_ROLE_REQUIRED", "CREATOR_THRESHOLD"]);
  });
  it("rejects invalid stored terms dates", () => {
    expect(
      evaluatePersistedPolicy(
        { ...subject, termsAcceptedAt: new Date("invalid") },
        "PARTICIPATION",
        rule,
      ).reasons,
    ).toContain("TERMS_ACCEPTANCE_REQUIRED");
  });
});

it("marks pre-existing margin shortfalls as blocked even when requested pool is zero", () => {
  const decision = evaluateMarginGovernor({
    grossEligibleRevenueMinor: 0n,
    requestedPoolMinor: 0n,
    liabilities: { refundsMinor: 1n },
    rule: marginRule,
  });
  expect(decision.status).toBe("BLOCKED");
  expect(decision.reasons).toContain("EXISTING_LIABILITIES_EXCEED_CAPACITY");
  expect(decision.allowedPoolMinor).toBe(0n);
});
