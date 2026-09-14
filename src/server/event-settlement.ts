import { isDevelopment } from "./environment";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Event, User } from "@prisma/client";
import {
  eventConfigurationSchema,
  previewEventSettlement,
  type SettlementPoint,
  eventPrizeExposure,
} from "../domains/economy/event-settlement";
import { canonicalPayload } from "../domains/economy/shared";
import { evaluatePersistedPolicy } from "../domains/policy";
import { atomic, jsonValue, type Tx } from "./db";
import { assert } from "./errors";
import { account, balance, postLedger } from "./ledger";
import { activeRules } from "./rules";
import { assertApprovedEvent, independentEventAdmin, lockEvent } from "./events";
import { consumeApproval } from "./security/approvals";
const fingerprint = (payload: string) => createHash("sha256").update(payload).digest("hex");

async function calculate(tx: Tx, event: Event) {
  const { record, config } = await activeRules(tx);
  const configuration = eventConfigurationSchema.parse(
    event.configVersion === "legacy-event-v1"
      ? {
          version: event.configVersion,
          pointRules: {},
          maxPointsPerUserPerDay: 10000000,
          participantCap: 10000,
          allowedCountries: config.allowedCountries,
          milestones: [],
          rewardTiers: [],
          ruBonusBudgetMicros: "0",
          unusedFunds: "RETURN_SPONSOR",
        }
      : event.configuration,
  );
  if (event.configVersion !== "legacy-event-v1") assertApprovedEvent(event);
  const pendingActivities = await tx.activity.count({
    where: { eventId: event.id, state: "PENDING_VALIDATION" },
  });
  assert(
    pendingActivities === 0,
    "EVENT_PENDING_ACTIVITY",
    "Resolve every pending activity before freezing the event.",
    409,
  );
  const memberships = await tx.eventMembership.findMany({
    where: { eventId: event.id },
    include: { user: true },
    orderBy: { userId: "asc" },
  });
  const rows = await tx.eventPoint.findMany({
    where: { eventId: event.id },
    include: { activity: { select: { state: true, createdAt: true } } },
    orderBy: { id: "asc" },
  });
  const originals = new Map(
    rows.filter((p) => !p.reversal).map((p) => [`${p.activityId}:${p.userId}`, p]),
  );
  const entries: SettlementPoint[] = rows.map((row) => {
    assert(
      ["VALIDATED", "REVERSED"].includes(row.activity.state),
      "EVENT_POINT_ACTIVITY_INVALID",
      "Event points require a validated or exactly reversed source activity.",
      409,
    );
    const original = originals.get(`${row.activityId}:${row.userId}`);
    if (row.activity.state === "REVERSED")
      assert(
        rows.some((r) => r.reversal && r.activityId === row.activityId && r.userId === row.userId),
        "EVENT_POINT_REVERSAL_MISSING",
        "A reversed activity requires its exact point reversal.",
        409,
      );
    if (row.reversal)
      assert(
        original,
        "EVENT_POINT_REVERSAL_MISSING",
        "A point reversal requires its original award.",
        409,
      );
    return {
      id: row.id,
      eventId: row.eventId,
      userId: row.userId,
      activityId: row.activityId,
      points: row.amount,
      occurredAt: row.createdAt.toISOString(),
      ruleVersion: row.ruleVersion,
      ...(row.reversal ? { reversalOf: original!.id } : {}),
    };
  });
  const participants = memberships.map((member) => {
    const policy = evaluatePersistedPolicy(member.user, "DISTRIBUTION", config);
    const reasons = [...policy.reasons];
    if (member.disqualified) reasons.push("EVENT_DISQUALIFIED");
    if ([event.ownerId, event.sponsorId, event.hostId].includes(member.userId))
      reasons.push("EVENT_SELF_PARTICIPATION");
    if (!member.user.country || !configuration.allowedCountries.includes(member.user.country))
      reasons.push("EVENT_COUNTRY_POLICY");
    if (!isDevelopment() && member.user.isDemo) reasons.push("DEMO_PRODUCTION_BLOCKED");
    return { userId: member.userId, eligible: reasons.length === 0, reasons };
  });
  return previewEventSettlement({
    eventId: event.id,
    ruleVersion: event.configVersion,
    eligibilityPolicyVersion: record.version,
    configuration,
    prizeBudgetMinor: event.prizeBudgetMinor,
    fundedMinor: await balance(tx, `event:${event.id}:prize`),
    pendingActivities,
    participants,
    entries,
  });
}
export async function createEventSettlementPreview(admin: User, eventId: string) {
  return atomic(async (tx) => {
    const event = await lockEvent(tx, eventId);
    await independentEventAdmin(tx, admin.id, event);
    assert(
      ["COMPLETED", "SETTLING"].includes(event.state) && event.endAt <= new Date(),
      "EVENT_NOT_ENDED",
      "Settlement requires a completed event after its approved end time.",
      409,
    );
    assert(
      !(await tx.eventSettlement.findFirst({ where: { eventId, state: "FINALIZED" } })),
      "EVENT_ALREADY_SETTLED",
      "This event already has a final settlement.",
      409,
    );
    const preview = await calculate(tx, event);
    assert(
      !preview.allocations.some((p) => p.userId === admin.id && p.amountMinor > 0n),
      "REVIEW_CONFLICT",
      "A prize recipient cannot administer their event settlement.",
      403,
    );
    if (event.state !== "SETTLING")
      await tx.event.update({ where: { id: eventId }, data: { state: "SETTLING" } });
    const settlement = await tx.eventSettlement.create({
      data: {
        eventId,
        createdById: admin.id,
        ruleVersion: event.configVersion,
        snapshot: jsonValue(preview),
        fingerprint: fingerprint(preview.payload),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        targetId: eventId,
        action: "EVENT_SETTLEMENT_PREVIEWED",
        details: jsonValue({
          previewId: settlement.id,
          fingerprint: settlement.fingerprint,
          awardedMinor: preview.awardedMinor,
          refundMinor: preview.refundMinor,
          excluded: preview.excluded,
        }),
      },
    });
    return { settlement, preview };
  });
}
export async function finalizeEventSettlement(admin: User, eventId: string, input: unknown) {
  const value = z
    .object({
      previewId: z.string().min(1).max(100),
      idempotencyKey: z.string().regex(/^[a-zA-Z0-9:_-]{8,100}$/),
      approvalId: z.string().min(1).max(100),
    })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const event = await lockEvent(tx, eventId);
    await independentEventAdmin(tx, admin.id, event);
    const settlement = await tx.eventSettlement.findUnique({ where: { id: value.previewId } });
    assert(
      settlement && settlement.eventId === eventId,
      "EVENT_PREVIEW_NOT_FOUND",
      "Event settlement preview not found.",
      404,
    );
    const requestPayload = canonicalPayload({ actorId: admin.id, eventId, ...value });
    const reusedKey = await tx.eventSettlement.findUnique({
      where: { idempotencyKey: value.idempotencyKey },
    });
    assert(
      !reusedKey || reusedKey.id === settlement.id,
      "IDEMPOTENCY_CONFLICT",
      "The finalization key belongs to another settlement.",
      409,
    );
    if (settlement.state === "FINALIZED") {
      assert(
        settlement.idempotencyKey === value.idempotencyKey &&
          settlement.finalizePayload === requestPayload,
        "IDEMPOTENCY_CONFLICT",
        "This finalized settlement has a different request payload.",
        409,
      );
      return { settlement };
    }
    assert(
      event.state === "SETTLING" && event.endAt <= new Date(),
      "EVENT_SETTLEMENT_STATE",
      "The event must have a frozen settlement preview.",
      409,
    );
    assert(
      !(await tx.eventSettlement.findFirst({ where: { eventId, state: "FINALIZED" } })),
      "EVENT_ALREADY_SETTLED",
      "This event already has a final settlement.",
      409,
    );
    const preview = await calculate(tx, event);
    assert(
      fingerprint(preview.payload) === settlement.fingerprint,
      "STALE_EVENT_PREVIEW",
      "Eligibility, rules or funding changed. Create a fresh event preview.",
      409,
    );
    assert(
      !preview.allocations.some((p) => p.userId === admin.id && p.amountMinor > 0n),
      "REVIEW_CONFLICT",
      "A prize recipient cannot finalize their event settlement.",
      403,
    );
    await consumeApproval(tx, admin.id, value.approvalId, {
      operation: "EVENT_SETTLEMENT",
      targetId: eventId,
      payload: { previewId: settlement.id, fingerprint: settlement.fingerprint },
      ruleVersion: settlement.ruleVersion,
    });
    const entries: { accountId: string; amountMinor: bigint }[] = [];
    for (const allocation of preview.allocations)
      if (allocation.amountMinor > 0n) {
        await account(tx, `user:${allocation.userId}`, "USER_PAYABLE", {
          userId: allocation.userId,
        });
        entries.push({
          accountId: `user:${allocation.userId}`,
          amountMinor: allocation.amountMinor,
        });
      }
    if (preview.refundMinor > 0n) {
      assert(
        event.sponsorId,
        "EVENT_SPONSOR_REQUIRED",
        "The remaining prize pool must return to its original sponsor.",
        409,
      );
      await account(tx, `advertiser:${event.sponsorId}`, "ADVERTISER_AVAILABLE", {
        userId: event.sponsorId,
      });
      entries.push({
        accountId: `advertiser:${event.sponsorId}`,
        amountMinor: preview.refundMinor,
      });
    }
    let ledgerId: string | null = null;
    if (preview.snapshot.fundedMinor > 0n) {
      const ledger = await postLedger(tx, {
        key: `event-settle:${value.idempotencyKey}`,
        kind: "EVENT_PRIZE_SETTLEMENT",
        referenceId: eventId,
        description: "Pay the immutable event prizes and return all unused sponsor funds",
        isDemo: event.isDemo,
        entries: [
          { accountId: `event:${eventId}:prize`, amountMinor: -preview.snapshot.fundedMinor },
          ...entries,
        ],
      });
      ledgerId = ledger.id;
    }
    const finalizedAt = new Date();
    const finalized = await tx.eventSettlement.update({
      where: { id: settlement.id },
      data: {
        state: "FINALIZED",
        idempotencyKey: value.idempotencyKey,
        finalizePayload: requestPayload,
        finalizedAt,
        snapshot: jsonValue({
          state: "FINALIZED",
          preview,
          ledgerId,
          approvalId: value.approvalId,
          finalizedBy: admin.id,
          finalizedAt: finalizedAt.toISOString(),
        }),
      },
    });
    await tx.event.update({
      where: { id: eventId },
      data: { state: "SETTLED", fundingState: "SETTLED" },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        targetId: eventId,
        action: "EVENT_SETTLEMENT_FINALIZED",
        details: jsonValue({
          previewId: settlement.id,
          fingerprint: settlement.fingerprint,
          approvalId: value.approvalId,
          ledgerId,
          awardedMinor: preview.awardedMinor,
          refundMinor: preview.refundMinor,
          ruleVersion: settlement.ruleVersion,
        }),
      },
    });
    return { settlement: finalized };
  });
}
export async function currentEventPrizeExposure(tx: Tx) {
  const events = await tx.event.findMany({
    where: { state: { notIn: ["SETTLED", "CANCELLED"] } },
    select: { id: true, state: true, prizeBudgetMinor: true },
    orderBy: { id: "asc" },
  });
  const balances = await tx.ledgerEntry.groupBy({
    by: ["accountId"],
    where: { account: { kind: "EVENT_PRIZE", eventId: { in: events.map((event) => event.id) } } },
    _sum: { amountMinor: true },
  });
  const funds = new Map(balances.map((row) => [row.accountId, row._sum.amountMinor ?? 0n]));
  const positions = events.map((event) => {
    const fundedMinor = funds.get(`event:${event.id}:prize`) ?? 0n;
    // Draft/review funding remains refundable. A live promise is its full disclosed pool.
    const promised = ["ACTIVE", "PAUSED", "COMPLETED", "SETTLING"].includes(event.state)
      ? event.prizeBudgetMinor
      : 0n;
    return {
      eventId: event.id,
      obligationMinor: promised > fundedMinor ? promised : fundedMinor,
      fundedMinor,
    };
  });
  return { ...eventPrizeExposure(positions), positions };
}
