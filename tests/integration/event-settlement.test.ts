import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Event, User } from "@prisma/client";
import { db, atomic, jsonValue } from "../../src/server/db";
import { account, balance, postLedger } from "../../src/server/ledger";
import { DEVELOPMENT_RULES } from "../../src/server/rules";
import {
  createEvent,
  reviewEvent,
  transitionEvent,
  fundEventPrize,
  joinEvent,
  getEvent,
  disqualifyEventParticipant,
} from "../../src/server/events";
import {
  createEventSettlementPreview,
  finalizeEventSettlement,
  currentEventPrizeExposure,
} from "../../src/server/event-settlement";
import { submitActivity, reviewActivity, reverseActivity } from "../../src/server/activities";
import { approvalPayloadHash } from "../../src/server/security/approvals";
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!url.pathname.endsWith("_test"))
  throw new Error(
    "Event integration requires an isolated *_test database; it never resets or deletes financial history.",
  );
const tag = randomUUID().slice(0, 8),
  reason = "Independent event integration review with retained evidence.";
let sponsor: User, admin: User, approver: User, a: User, b: User, c: User;
const operation = () => `events:${tag}:${randomUUID()}`;
const configuration = (cap = 20) => ({
  version: `event-rules-${tag}`,
  pointRules: { QUALIFIED_VIEW: 12 },
  maxPointsPerUserPerDay: 15,
  participantCap: cap,
  allowedCountries: ["FR"],
  milestones: [],
  rewardTiers:
    cap === 1
      ? [{ fromRank: 1, toRank: 1, shareBps: 10000 }]
      : [
          { fromRank: 1, toRank: 1, shareBps: 6000 },
          { fromRank: 2, toRank: 3, shareBps: 4000 },
        ],
  ruBonusBudgetMicros: "0",
  unusedFunds: "RETURN_SPONSOR",
});
const makeUser = (name: string, roles: ("USER" | "ADMIN" | "ADVERTISER")[]) =>
  db.user.create({
    data: {
      email: `event-${name}-${tag}@integration.test`,
      displayName: `Event ${name}`,
      handle: `event_${name}_${tag}`,
      passwordHash: "isolated-service-fixture-not-a-login",
      roles,
      onboarded: true,
      ageEligible: true,
      termsAcceptedAt: new Date(),
      country: "FR",
      isDemo: true,
    },
  });
beforeAll(async () => {
  await atomic(async (tx) => {
    await tx.economicRule.updateMany({ where: { active: true }, data: { active: false } });
    await tx.economicRule.create({
      data: { version: `events-${tag}`, config: jsonValue(DEVELOPMENT_RULES) },
    });
  });
  [sponsor, admin, approver, a, b, c] = await Promise.all([
    makeUser("sponsor", ["USER", "ADVERTISER"]),
    makeUser("admin", ["USER", "ADMIN"]),
    makeUser("approver", ["USER", "ADMIN"]),
    makeUser("a", ["USER"]),
    makeUser("b", ["USER"]),
    makeUser("c", ["USER"]),
  ]);
  await atomic(async (tx) => {
    await account(tx, `clearing:events:${tag}`, "CASH_CLEARING");
    await account(tx, `advertiser:${sponsor.id}`, "ADVERTISER_AVAILABLE", { userId: sponsor.id });
    await postLedger(tx, {
      key: operation(),
      kind: "DEVELOPMENT_EVENT_TEST_DEPOSIT",
      referenceId: sponsor.id,
      description: "Isolated development test fixture; no live payment",
      isDemo: true,
      entries: [
        { accountId: `clearing:events:${tag}`, amountMinor: -100000n },
        { accountId: `advertiser:${sponsor.id}`, amountMinor: 100000n },
      ],
    });
  });
});
afterAll(async () => {
  vi.useRealTimers();
  await db.$disconnect();
});
async function draft(budget = "1001", cap = 20) {
  return (
    await createEvent(sponsor, {
      slug: `event-${operation().replaceAll(":", "-")}`,
      localizedContent: {
        en: {
          title: "Funded event",
          description: "Independently reviewed test event.",
          rules: "Free entry. Validated points only; ties use earliest score.",
        },
        fr: {
          title: "Evenement finance",
          description: "Evenement de test controle independamment.",
          rules: "Entree gratuite. Points valides uniquement et departage stable.",
        },
      },
      configuration: configuration(cap),
      startAt: new Date(Date.now() - 3600000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      prizeBudgetMinor: budget,
      sponsor: "Test sponsor",
      idempotencyKey: operation(),
    })
  ).event;
}
async function ready(cap = 20) {
  const event = await draft("1001", cap);
  // Campaign media is an independently reviewed fixture; campaign lifecycle is covered by its own suite.
  const campaign = await db.campaign.create({
    data: {
      advertiserId: sponsor.id,
      name: "Reviewed event media",
      description: "Approved test creative evidence",
      objective: "QUALIFIED_VIEW",
      destinationUrl: "https://example.com/event-media",
      budgetMinor: 1000n,
      dailyBudgetMinor: 1000n,
      unitCostMinor: 25n,
      state: "ACTIVE",
      startAt: event.startAt,
      endAt: event.endAt,
      frequencyCap: 5,
      eventId: event.id,
      reviewReason: reason,
      isDemo: true,
    },
  });
  await atomic(async (tx) => {
    await account(tx, `campaign:${campaign.id}`, "CAMPAIGN_ESCROW", { campaignId: campaign.id });
    await postLedger(tx, {
      key: operation(),
      kind: "DEVELOPMENT_EVENT_TEST_CAMPAIGN_RESERVE",
      referenceId: campaign.id,
      description: "Isolated development campaign escrow fixture",
      isDemo: true,
      entries: [
        { accountId: `advertiser:${sponsor.id}`, amountMinor: -1000n },
        { accountId: `campaign:${campaign.id}`, amountMinor: 1000n },
      ],
    });
  });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      targetId: campaign.id,
      action: "CAMPAIGN_REVIEWED",
      details: { decision: "APPROVE", reason },
    },
  });
  await transitionEvent(sponsor, event.id, {
    action: "SUBMIT",
    reason,
    idempotencyKey: operation(),
  });
  await reviewEvent(admin, event.id, { decision: "APPROVE", reason });
  await fundEventPrize(sponsor, event.id, { amountMinor: "1001", idempotencyKey: operation() });
  await transitionEvent(sponsor, event.id, {
    action: "ACTIVATE",
    reason,
    idempotencyKey: operation(),
  });
  return { event, campaign };
}
async function activity(user: User, eventId: string, campaignId: string, validate = true) {
  await joinEvent(user, eventId);
  const result = await submitActivity(user, {
    campaignId,
    eventId,
    type: "QUALIFIED_VIEW",
    idempotencyKey: operation(),
    evidence: "Independent event fixture evidence for a qualified view.",
  });
  if (validate)
    await reviewActivity(admin, result.activity.id, {
      decision: "VALIDATE",
      reason,
      evidenceVerified: true,
    });
  return result.activity;
}
async function ended<T>(event: Event, work: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(event.endAt.getTime() + 1000);
  try {
    await transitionEvent(sponsor, event.id, {
      action: "COMPLETE",
      reason,
      idempotencyKey: operation(),
    });
    return await work();
  } finally {
    vi.useRealTimers();
  }
}
async function approve(
  eventId: string,
  preview: { id: string; fingerprint: string; ruleVersion: string },
  requester = admin,
  reviewer = approver,
) {
  const expected = {
    operation: "EVENT_SETTLEMENT" as const,
    targetId: eventId,
    payload: { previewId: preview.id, fingerprint: preview.fingerprint },
    ruleVersion: preview.ruleVersion,
  };
  const approval = await db.financialApproval.create({
    data: {
      id: randomUUID(),
      requesterId: requester.id,
      ...expected,
      payloadHash: approvalPayloadHash(expected),
      reason,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  return db.financialApproval.update({
    where: { id: approval.id },
    data: {
      state: "APPROVED",
      approverId: reviewer.id,
      reviewedAt: new Date(),
      reviewReason: reason,
    },
  });
}
describe("PostgreSQL funded event accounting and immutable settlement", () => {
  it("concurrent create replays one command and changed payload conflicts", async () => {
    const key = operation();
    const value = {
      slug: `event-create-${key.replaceAll(":", "-")}`,
      localizedContent: {
        en: {
          title: "Idempotent event",
          description: "Create race integration fixture.",
          rules: "Free entry and validated activity only.",
        },
        fr: {
          title: "Evenement idempotent",
          description: "Creation simultanee du test.",
          rules: "Entree gratuite et activite validee uniquement.",
        },
      },
      configuration: configuration(),
      startAt: new Date(Date.now() - 60000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      prizeBudgetMinor: "1001",
      idempotencyKey: key,
    };
    const result = await Promise.all([createEvent(sponsor, value), createEvent(sponsor, value)]);
    expect(result[0]!.event.id).toBe(result[1]!.event.id);
    await expect(
      createEvent(sponsor, { ...value, prizeBudgetMinor: "1002" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("reserves existing sponsor funds once under concurrent retries and rejects changed payload", async () => {
    const event = await draft();
    const before = await balance(db, `advertiser:${sponsor.id}`);
    const key = operation();
    await Promise.all([
      fundEventPrize(sponsor, event.id, { amountMinor: "600", idempotencyKey: key }),
      fundEventPrize(sponsor, event.id, { amountMinor: "600", idempotencyKey: key }),
    ]);
    expect(await balance(db, `event:${event.id}:prize`)).toBe(600n);
    expect(await balance(db, `advertiser:${sponsor.id}`)).toBe(before - 600n);
    expect(
      await db.rewardUnit.count({ where: { userId: sponsor.id, activity: { eventId: event.id } } }),
    ).toBe(0);
    await expect(
      fundEventPrize(sponsor, event.id, { amountMinor: "500", idempotencyKey: key }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      fundEventPrize(a, event.id, { amountMinor: "1", idempotencyKey: operation() }),
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      fundEventPrize(sponsor, event.id, { amountMinor: "400", idempotencyKey: operation() }),
      fundEventPrize(sponsor, event.id, { amountMinor: "400", idempotencyKey: operation() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(db, `event:${event.id}:prize`)).toBe(1000n);
  });
  it("returns every reserved cent under concurrent cancellation and funding", async () => {
    const event = await draft();
    const before = await balance(db, `advertiser:${sponsor.id}`);
    const results = await Promise.allSettled([
      fundEventPrize(sponsor, event.id, { amountMinor: "501", idempotencyKey: operation() }),
      transitionEvent(sponsor, event.id, { action: "CANCEL", reason, idempotencyKey: operation() }),
    ]);
    expect(results[1]!.status).toBe("fulfilled");
    expect(await balance(db, `event:${event.id}:prize`)).toBe(0n);
    expect(await balance(db, `advertiser:${sponsor.id}`)).toBe(before);
  });
  it("requires review and full funding and locks disclosed prize configuration", async () => {
    const event = await draft();
    await expect(
      transitionEvent(sponsor, event.id, {
        action: "ACTIVATE",
        reason,
        idempotencyKey: operation(),
      }),
    ).rejects.toMatchObject({ code: "EVENT_STATE" });
    await transitionEvent(sponsor, event.id, {
      action: "SUBMIT",
      reason,
      idempotencyKey: operation(),
    });
    await expect(
      reviewEvent({ ...sponsor, roles: ["USER", "ADVERTISER", "ADMIN"] }, event.id, {
        decision: "APPROVE",
        reason,
      }),
    ).rejects.toThrow();
    await expect(
      db.event.update({ where: { id: event.id }, data: { prizeBudgetMinor: 2000n } }),
    ).rejects.toThrow();
    await expect(
      reviewEvent(admin, event.id, { decision: "APPROVE", reason }),
    ).rejects.toMatchObject({ code: "EVENT_MEDIA_REQUIRED" });
    const prepared = await ready();
    await expect(
      db.event.update({
        where: { id: prepared.event.id },
        data: { configuration: { ...configuration(), ruBonusBudgetMicros: "1" } },
      }),
    ).rejects.toThrow();
    await expect(
      atomic(async (tx) => {
        await postLedger(tx, {
          key: operation(),
          kind: "EVENT_PRIZE_REFUND",
          referenceId: prepared.event.id,
          description: "Attempt to release a live event pool",
          isDemo: true,
          entries: [
            { accountId: `event:${prepared.event.id}:prize`, amountMinor: -1n },
            { accountId: `advertiser:${sponsor.id}`, amountMinor: 1n },
          ],
        });
      }),
    ).rejects.toThrow();
  });
  it("serializes participant capacity and rejects sponsor self farming", async () => {
    const { event } = await ready(1);
    await expect(joinEvent(sponsor, event.id)).rejects.toMatchObject({
      code: "SELF_PARTICIPATION",
    });
    const results = await Promise.allSettled([joinEvent(a, event.id), joinEvent(b, event.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.eventMembership.count({ where: { eventId: event.id } })).toBe(1);
  });
  it("uses immutable point rules with a UTC daily cap while retaining separate RU and XP", async () => {
    const { event, campaign } = await ready();
    await activity(a, event.id, campaign.id);
    await activity(a, event.id, campaign.id);
    const points = await db.eventPoint.findMany({
      where: { eventId: event.id, userId: a.id },
      orderBy: { createdAt: "asc" },
    });
    expect(points.map((p) => p.amount)).toEqual([12, 3]);
    expect(points.every((p) => p.ruleVersion === event.configVersion)).toBe(true);
    expect(
      await db.rewardUnit.count({ where: { activity: { eventId: event.id }, userId: a.id } }),
    ).toBe(2);
    expect(
      await db.xpEntry.count({ where: { activity: { eventId: event.id }, userId: a.id } }),
    ).toBe(2);
  });
  it("blocks freezing pending review, then freezes activity and point history", async () => {
    const { event, campaign } = await ready();
    const pending = await activity(a, event.id, campaign.id, false);
    await ended(event, async () => {
      await expect(createEventSettlementPreview(admin, event.id)).rejects.toMatchObject({
        code: "EVENT_PENDING_ACTIVITY",
      });
      await reviewActivity(admin, pending.id, {
        decision: "VALIDATE",
        reason,
        evidenceVerified: true,
      });
      await createEventSettlementPreview(admin, event.id);
      await expect(reverseActivity(admin, pending.id, { reason })).rejects.toMatchObject({
        code: "EVENT_SETTLEMENT_FROZEN",
      });
      await expect(
        db.eventPoint.create({
          data: {
            userId: a.id,
            eventId: event.id,
            activityId: pending.id,
            amount: -12,
            reversal: true,
            ruleVersion: event.configVersion,
          },
        }),
      ).rejects.toThrow();
      await expect(
        db.activity.update({ where: { id: pending.id }, data: { state: "REVERSED" } }),
      ).rejects.toThrow();
    });
  });
  it("detects changed eligibility, pays exact prizes once, refunds vacant ranks and preserves public final ranking", async () => {
    const { event, campaign } = await ready();
    await activity(a, event.id, campaign.id);
    await activity(b, event.id, campaign.id);
    await ended(event, async () => {
      const stale = await createEventSettlementPreview(admin, event.id);
      await db.user.update({ where: { id: a.id }, data: { economicHold: true } });
      const unusedApproval = await approve(event.id, stale.settlement);
      await expect(
        finalizeEventSettlement(admin, event.id, {
          previewId: stale.settlement.id,
          idempotencyKey: operation(),
          approvalId: unusedApproval.id,
        }),
      ).rejects.toMatchObject({ code: "STALE_EVENT_PREVIEW" });
      expect(
        (await db.financialApproval.findUniqueOrThrow({ where: { id: unusedApproval.id } })).state,
      ).toBe("APPROVED");
      await disqualifyEventParticipant(admin, event.id, { userId: a.id, reason });
      const fresh = await createEventSettlementPreview(admin, event.id);
      expect(fresh.preview.allocations.map((p) => [p.userId, p.amountMinor])).toEqual([
        [b.id, 601n],
      ]);
      expect(fresh.preview.refundMinor).toBe(400n);
      const approval = await approve(event.id, fresh.settlement);
      const payload = {
        previewId: fresh.settlement.id,
        idempotencyKey: operation(),
        approvalId: approval.id,
      };
      const before = await balance(db, `user:${b.id}`);
      const finals = await Promise.all([
        finalizeEventSettlement(admin, event.id, payload),
        finalizeEventSettlement(admin, event.id, payload),
      ]);
      expect(finals[0]!.settlement.id).toBe(finals[1]!.settlement.id);
      expect(await balance(db, `user:${b.id}`)).toBe(before + 601n);
      expect(await balance(db, `event:${event.id}:prize`)).toBe(0n);
      expect(
        await db.ledgerTransaction.count({
          where: { kind: "EVENT_PRIZE_SETTLEMENT", referenceId: event.id },
        }),
      ).toBe(1);
      expect(
        (await db.financialApproval.findUniqueOrThrow({ where: { id: approval.id } })).state,
      ).toBe("EXECUTED");
      await expect(
        finalizeEventSettlement(admin, event.id, { ...payload, approvalId: unusedApproval.id }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await expect(
        db.eventSettlement.update({ where: { id: fresh.settlement.id }, data: { snapshot: {} } }),
      ).rejects.toThrow();
      await expect(
        disqualifyEventParticipant(admin, event.id, { userId: b.id, reason }),
      ).rejects.toMatchObject({ code: "EVENT_FINALIZED" });
      await db.user.update({ where: { id: a.id }, data: { economicHold: false } });
      expect((await getEvent(event.slug)).leaderboard.map((p) => p.userId)).toEqual([b.id]);
    });
  });
  it("serializes reversal against preview and cancellation against finalization", async () => {
    const { event, campaign } = await ready();
    const original = await activity(c, event.id, campaign.id);
    await ended(event, async () => {
      const race = await Promise.allSettled([
        createEventSettlementPreview(admin, event.id),
        reverseActivity(admin, original.id, { reason }),
      ]);
      expect(race[0]!.status).toBe("fulfilled");
      const preview = (
        race[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createEventSettlementPreview>>>
      ).value;
      const activityRow = await db.activity.findUniqueOrThrow({ where: { id: original.id } });
      expect(preview.preview.awardedMinor).toBe(activityRow.state === "REVERSED" ? 0n : 601n);
      const approval = await approve(event.id, preview.settlement);
      const outcomes = await Promise.allSettled([
        finalizeEventSettlement(admin, event.id, {
          previewId: preview.settlement.id,
          idempotencyKey: operation(),
          approvalId: approval.id,
        }),
        transitionEvent(admin, event.id, { action: "CANCEL", reason, idempotencyKey: operation() }),
      ]);
      expect(outcomes[0]!.status).toBe("fulfilled");
      expect(outcomes[1]!.status).toBe("rejected");
      expect(await balance(db, `event:${event.id}:prize`)).toBe(0n);
    });
  });
  it("keeps earmarked assets out of GDP and blocks disguised prize transfers to revenue", async () => {
    const { event } = await ready();
    const exposure = await atomic((tx) => currentEventPrizeExposure(tx));
    expect(exposure.positions.find((p) => p.eventId === event.id)).toEqual({
      eventId: event.id,
      obligationMinor: 1001n,
      fundedMinor: 1001n,
    });
    expect(exposure.unfundedLiabilityMinor).toBe(0n);
    await expect(
      atomic(async (tx) => {
        await account(tx, "platform:revenue", "PLATFORM_REVENUE");
        await postLedger(tx, {
          key: operation(),
          kind: "EVENT_PRIZE_SETTLEMENT",
          referenceId: event.id,
          description: "Attempt disguised prize transfer to revenue",
          isDemo: true,
          entries: [
            { accountId: `event:${event.id}:prize`, amountMinor: -1n },
            { accountId: "platform:revenue", amountMinor: 1n },
          ],
        });
      }),
    ).rejects.toThrow();
    expect(await balance(db, `event:${event.id}:prize`)).toBe(1001n);
    const sums = await db.ledgerEntry.groupBy({
      by: ["transactionId"],
      _sum: { amountMinor: true },
    });
    expect(sums.every((p) => p._sum.amountMinor === 0n)).toBe(true);
  });
});
