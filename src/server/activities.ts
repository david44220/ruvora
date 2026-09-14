import { z } from "zod";
import type { User } from "@prisma/client";
import { calculateActivityRewards, validateActivity } from "../domains/economy/activity";
import { atomic, jsonValue } from "./db";
import { assert } from "./errors";
import { limitRate, requireRole } from "./auth";
import { account, balance, postLedger } from "./ledger";
import { activeRules } from "./rules";
import { assertEligible } from "./profiles";
import { idempotencyKey, reason } from "./campaigns";
import {
  attributionTokenHash,
  attributionSessionKey,
  resolveActivityAttribution,
  verifyActivityAttribution,
  recordGrowth,
  type AttributionTokens,
} from "./attribution";
import { awardReferralForActivity } from "./referrals";
import { assertEventActivityEligible, eventPointsAward } from "./events";
import { campaignRegionAllowed } from "./campaign-eligibility";
import { getConversionDecision, hasVerifiedConversion } from "./providers/conversions";
import { isDevelopment } from "./environment";
const activitySchema = z
  .object({
    campaignId: z.string().min(1).max(100),
    type: z.enum([
      "IMPRESSION",
      "QUALIFIED_VIEW",
      "CLICK",
      "CONVERSION",
      "CREATOR_PROMOTION",
      "SPONSORED_MISSION",
    ]),
    idempotencyKey,
    eventId: z.string().max(100).optional(),
    evidence: z.string().trim().min(10).max(1000).optional(),
  })
  .strict();
export async function submitActivity(user: User, input: unknown, tokens?: AttributionTokens) {
  const value = activitySchema.parse(input);
  const fingerprint = attributionTokenHash(
    JSON.stringify({
      body: value,
      context: tokens?.attributionToken ? attributionTokenHash(tokens.attributionToken) : null,
      visitor: tokens?.visitorToken ? attributionTokenHash(tokens.visitorToken) : null,
    }),
  );
  await limitRate("activity", user.id, 30, 3600);
  return atomic(async (tx) => {
    const freshUser = await assertEligible(tx, user.id);
    const key = `${user.id}:${value.idempotencyKey}`;
    const existing = await tx.activity.findUnique({
      where: { idempotencyKey: key },
      include: { creator: { select: { handle: true } } },
    });
    if (existing) {
      assert(
        existing.userId === user.id &&
          existing.campaignId === value.campaignId &&
          existing.type === value.type &&
          existing.eventId === (value.eventId ?? null) &&
          existing.evidence === (value.evidence ?? null) &&
          (existing.requestFingerprint
            ? existing.requestFingerprint === fingerprint
            : !existing.creatorId && !tokens?.attributionToken),
        "IDEMPOTENCY_CONFLICT",
        "This key was used for a different activity.",
        409,
      );
      return { activity: existing };
    }
    const campaign = await tx.campaign.findUnique({ where: { id: value.campaignId } });
    const now = new Date();
    assert(
      campaign && campaign.state === "ACTIVE" && campaign.startAt <= now && campaign.endAt > now,
      "CAMPAIGN_INACTIVE",
      "This campaign is not accepting activity.",
      409,
    );
    assert(
      isDevelopment() || !campaign.isDemo,
      "DEMO_PRODUCTION_BLOCKED",
      "Development campaigns cannot accept production activity.",
      403,
    );
    assert(
      campaignRegionAllowed(freshUser, campaign),
      "CAMPAIGN_REGION_INELIGIBLE",
      "This campaign is unavailable in your country.",
      403,
    );
    assert(
      campaign.advertiserId !== user.id,
      "SELF_PARTICIPATION",
      "Advertisers cannot earn rewards by participating in their own campaigns.",
      403,
    );
    assert(
      campaign.objective === value.type,
      "INVALID_ACTIVITY_TYPE",
      "This activity does not match the campaign objective.",
    );
    assert(
      (await balance(tx, `campaign:${campaign.id}`)) >= campaign.unitCostMinor,
      "INSUFFICIENT_FUNDS",
      "This campaign's budget is exhausted.",
      409,
    );
    const since = new Date(now);
    since.setUTCHours(0, 0, 0, 0);
    const prior = await tx.activity.count({
      where: {
        userId: user.id,
        campaignId: campaign.id,
        createdAt: { gte: since },
        state: { in: ["PENDING_VALIDATION", "VALIDATED"] },
      },
    });
    assert(
      prior < campaign.frequencyCap,
      "FREQUENCY_CAP",
      "You have reached this campaign's daily participation limit.",
      429,
    );
    if (value.eventId) {
      assert(
        campaign.eventId === value.eventId,
        "EVENT_MISMATCH",
        "This campaign is not linked to the selected event.",
      );
      const membership = await tx.eventMembership.findUnique({
        where: { eventId_userId: { eventId: value.eventId, userId: user.id } },
        include: { event: true },
      });
      assert(
        membership &&
          membership.event.state === "ACTIVE" &&
          membership.event.startAt <= now &&
          membership.event.endAt > now,
        "EVENT_NOT_JOINED",
        "Join an active event before submitting event activity.",
      );
    }
    if (value.eventId) await assertEventActivityEligible(tx, value.eventId, user.id, now, "SUBMIT");
    const attributed = await resolveActivityAttribution(
      tx,
      freshUser,
      campaign,
      value.eventId,
      tokens,
    );
    const creatorId = attributed?.context.creatorId ?? undefined;
    const activity = await tx.activity.create({
      data: {
        userId: user.id,
        campaignId: campaign.id,
        eventId: value.eventId,
        creatorId,
        type: value.type,
        idempotencyKey: key,
        evidence: value.evidence,
        requestFingerprint: fingerprint,
        ...(attributed
          ? { attributionId: attributed.context.id, attributionSnapshot: attributed.snapshot }
          : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ACTIVITY_RECEIVED",
        targetId: activity.id,
        details: { state: "PENDING_VALIDATION", campaignId: campaign.id },
      },
    });
    await recordGrowth(tx, {
      dedupeKey: `campaign-start:${attributed ? attributionSessionKey(attributed.context) : user.id}:${campaign.id}`,
      type: "CAMPAIGN_START",
      attributionId: attributed?.context.id,
      shareLinkId: attributed?.context.shareLinkId,
      creatorId,
      userId: user.id,
      campaignId: campaign.id,
      eventId: value.eventId,
      isDemo: campaign.isDemo || Boolean(attributed?.context.isDemo),
    });
    return { activity };
  });
}
export async function reviewActivity(admin: User, activityId: string, input: unknown) {
  requireRole(admin, "ADMIN");
  const value = z
    .object({
      decision: z.enum(["VALIDATE", "REJECT"]),
      reason,
      evidenceVerified: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const reviewer = await tx.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert(
      reviewer.roles.includes("ADMIN") && !reviewer.suspended && !reviewer.economicHold,
      "FORBIDDEN",
      "An active independent administrator is required.",
      403,
    );
    const activity = await tx.activity.findUnique({
      where: { id: activityId },
      include: { campaign: true },
    });
    assert(activity, "ACTIVITY_NOT_FOUND", "Activity not found.", 404);
    if (
      (value.decision === "VALIDATE" && activity.state === "VALIDATED") ||
      (value.decision === "REJECT" && activity.state === "REJECTED")
    )
      return { activity };
    assert(
      activity.state === "PENDING_VALIDATION",
      "INVALID_ACTIVITY_STATE",
      "Only pending activity can be reviewed.",
      409,
    );
    assert(
      activity.userId !== admin.id &&
        activity.campaign.advertiserId !== admin.id &&
        activity.creatorId !== admin.id,
      "REVIEW_CONFLICT",
      "An administrator cannot validate activity benefiting their own account.",
      403,
    );
    const referral = await tx.referral.findUnique({
      where: { inviteeId: activity.userId },
      select: { inviterId: true, attributionId: true },
    });
    assert(
      !referral?.attributionId || referral.inviterId !== admin.id,
      "REVIEW_CONFLICT",
      "An administrator cannot review activity benefiting their referral account.",
      403,
    );
    if (value.decision === "REJECT") {
      if (activity.eventId)
        await assertEventActivityEligible(
          tx,
          activity.eventId,
          activity.userId,
          activity.createdAt,
          "REVERSE",
          admin.id,
        );
      const rejected = await tx.activity.update({
        where: { id: activityId },
        data: { state: "REJECTED", reviewReason: value.reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "ACTIVITY_REJECTED",
          targetId: activityId,
          details: value,
        },
      });
      return { activity: rejected };
    }
    assert(
      isDevelopment() || !activity.campaign.isDemo,
      "DEMO_PRODUCTION_BLOCKED",
      "Development campaigns cannot generate production revenue.",
      403,
    );
    const participant = await assertEligible(tx, activity.userId);
    assert(
      campaignRegionAllowed(participant, activity.campaign),
      "CAMPAIGN_REGION_INELIGIBLE",
      "The participant is outside the campaign region policy.",
      403,
    );
    await verifyActivityAttribution(tx, activity, activity.campaign);
    await assertEligible(tx, activity.campaign.advertiserId);
    if (activity.creatorId) await assertEligible(tx, activity.creatorId);
    const guardedEvent = activity.eventId
      ? await assertEventActivityEligible(
          tx,
          activity.eventId,
          activity.userId,
          activity.createdAt,
          "VALIDATE",
          admin.id,
        )
      : null;
    const { record, reward } = await activeRules(tx);
    const providerDecision =
      activity.type === "CONVERSION"
        ? await getConversionDecision(tx, activity.id, activity.campaignId)
        : null;
    assert(
      providerDecision !== "REJECTED" && providerDecision !== "REVERSED",
      "CONVERSION_PROVIDER_REJECTED",
      "The conversion provider rejected or reversed this activity.",
      409,
    );
    const conversionVerified =
      activity.type !== "CONVERSION" ||
      (await hasVerifiedConversion(tx, activity.id, activity.campaignId)) ||
      (isDevelopment() &&
        activity.campaign.isDemo &&
        value.evidenceVerified &&
        Boolean(activity.evidence));
    const start = new Date(activity.createdAt);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86_400_000);
    const priorCount = await tx.activity.count({
      where: {
        id: { not: activityId },
        userId: activity.userId,
        campaignId: activity.campaignId,
        state: "VALIDATED",
        createdAt: { gte: start, lt: end },
      },
    });
    const spent =
      (
        await tx.activity.aggregate({
          where: {
            campaignId: activity.campaignId,
            state: "VALIDATED",
            createdAt: { gte: start, lt: end },
          },
          _sum: { billableMinor: true },
        })
      )._sum.billableMinor ?? 0n;
    const remaining = await balance(tx, `campaign:${activity.campaignId}`);
    const dailyRemaining =
      activity.campaign.dailyBudgetMinor > spent ? activity.campaign.dailyBudgetMinor - spent : 0n;
    const decision = validateActivity({
      participantId: activity.userId,
      advertiserId: activity.campaign.advertiserId,
      authenticated: true,
      policyAllowed: true,
      campaignStatus: activity.campaign.state,
      type: activity.type,
      allowedTypes: [activity.campaign.objective],
      occurredAt: activity.createdAt.toISOString(),
      campaignStartAt: activity.campaign.startAt.toISOString(),
      campaignEndAt: activity.campaign.endAt.toISOString(),
      duplicate: false,
      priorActivityCount: priorCount,
      frequencyCap: activity.campaign.frequencyCap,
      billableMinor: activity.campaign.unitCostMinor,
      remainingBudgetMinor: remaining,
      dailyRemainingMinor: dailyRemaining,
      riskScore: 0,
      reviewThreshold: 100,
      conversionEvidenceVerified: conversionVerified,
    });
    assert(
      decision.state === "VALIDATED",
      "ACTIVITY_INELIGIBLE",
      `Activity validation failed: ${decision.reasons.join(", ")}.`,
      409,
    );
    if (activity.eventId) {
      const membership = await tx.eventMembership.findUniqueOrThrow({
        where: { eventId_userId: { eventId: activity.eventId, userId: activity.userId } },
        include: { event: true },
      });
      assert(
        membership.joinedAt <= activity.createdAt &&
          membership.event.startAt <= activity.createdAt &&
          membership.event.endAt > activity.createdAt,
        "EVENT_INELIGIBLE",
        "This activity falls outside event eligibility.",
      );
    }
    await account(tx, "platform:revenue", "PLATFORM_REVENUE");
    const transaction = await postLedger(tx, {
      key: `activity:${activityId}`,
      kind: "VALIDATED_ACTIVITY",
      referenceId: activityId,
      description: `Validated ${activity.type}`,
      isDemo: activity.campaign.isDemo,
      entries: [
        {
          accountId: `campaign:${activity.campaignId}`,
          amountMinor: -activity.campaign.unitCostMinor,
        },
        { accountId: "platform:revenue", amountMinor: activity.campaign.unitCostMinor },
      ],
    });
    const computedAwards = calculateActivityRewards(
      {
        activityId,
        type: activity.type,
        state: "VALIDATED",
        billableMinor: activity.campaign.unitCostMinor,
        participantId: activity.userId,
        advertiserId: activity.campaign.advertiserId,
        creatorId: activity.creatorId ?? undefined,
        eventId: activity.eventId ?? undefined,
      },
      reward,
    );
    const awards =
      computedAwards.eventPoints && guardedEvent
        ? {
            ...computedAwards,
            eventPoints: {
              ...computedAwards.eventPoints,
              amount: await eventPointsAward(
                tx,
                guardedEvent.id,
                activity.userId,
                activity.type,
                activity.createdAt,
                computedAwards.eventPoints.amount,
              ),
            },
          }
        : computedAwards;
    await tx.rewardUnit.createMany({
      data: awards.units.map((unit) => ({ ...unit, ruleVersion: record.version })),
    });
    if (awards.xp.amount > 0) await tx.xpEntry.create({ data: { ...awards.xp, activityId } });
    if (awards.eventPoints && awards.eventPoints.amount > 0)
      await tx.eventPoint.create({
        data: {
          ...awards.eventPoints,
          activityId,
          ruleVersion: guardedEvent?.configVersion ?? "legacy-event-v1",
        },
      });
    const referralAward = await awardReferralForActivity(
      tx,
      activity,
      awards.units.find((unit) => unit.category === "USER")?.amountMicros ?? 0n,
    );
    const updated = await tx.activity.update({
      where: { id: activityId },
      data: {
        state: "VALIDATED",
        billableMinor: activity.campaign.unitCostMinor,
        ruleVersion: record.version,
        validatedAt: new Date(),
        reviewReason: value.reason,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "ACTIVITY_VALIDATED_BILLED_REWARDED",
        targetId: activityId,
        details: jsonValue({
          ...value,
          transactionId: transaction.id,
          awards,
          referralAward,
          ruleId: record.id,
          attributionId: activity.attributionId,
        }),
      },
    });
    return { activity: updated, awards };
  });
}
export async function reverseActivity(admin: User, activityId: string, input: unknown) {
  requireRole(admin, "ADMIN");
  const value = z.object({ reason }).strict().parse(input);
  return atomic(async (tx) => {
    const reviewer = await tx.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert(
      reviewer.roles.includes("ADMIN") && !reviewer.suspended && !reviewer.economicHold,
      "FORBIDDEN",
      "An active independent administrator is required.",
      403,
    );
    const activity = await tx.activity.findUnique({
      where: { id: activityId },
      include: { rewards: true, xpEntries: true, eventPoints: true, campaign: true },
    });
    assert(activity, "ACTIVITY_NOT_FOUND", "Activity not found.", 404);
    if (activity.state === "REVERSED") return { activity };
    assert(
      activity.state === "VALIDATED",
      "INVALID_ACTIVITY_STATE",
      "Only validated activity can be reversed.",
      409,
    );
    assert(
      activity.userId !== admin.id &&
        activity.campaign.advertiserId !== admin.id &&
        activity.creatorId !== admin.id,
      "REVIEW_CONFLICT",
      "An administrator cannot reverse activity benefiting their own account.",
      403,
    );
    assert(
      activity.rewards.every((unit) => unit.userId !== admin.id),
      "REVIEW_CONFLICT",
      "An administrator cannot reverse activity benefiting their own reward account.",
      403,
    );
    assert(
      activity.rewards.every((unit) => unit.state !== "CONSUMED"),
      "FINALIZED_HISTORY",
      "Activity in a finalized distribution requires a separately reviewed recovery operation; historical results remain immutable.",
      409,
    );
    if (activity.eventId)
      await assertEventActivityEligible(
        tx,
        activity.eventId,
        activity.userId,
        activity.createdAt,
        "REVERSE",
        admin.id,
      );
    const original = await tx.ledgerTransaction.findUniqueOrThrow({
      where: { idempotencyKey: `activity:${activityId}` },
      include: { entries: true },
    });
    await postLedger(tx, {
      key: `reversal:${activityId}`,
      kind: "ACTIVITY_REVERSAL",
      referenceId: activityId,
      description: value.reason,
      reversesId: original.id,
      isDemo: original.isDemo,
      entries: original.entries.map((entry) => ({
        accountId: entry.accountId,
        amountMinor: -entry.amountMinor,
      })),
    });
    await tx.rewardUnit.updateMany({ where: { activityId }, data: { state: "REVERSED" } });
    await tx.xpEntry.createMany({
      data: activity.xpEntries
        .filter((entry) => !entry.reversal)
        .map((entry) => ({
          userId: entry.userId,
          activityId,
          amount: -entry.amount,
          reversal: true,
        })),
    });
    await tx.eventPoint.createMany({
      data: activity.eventPoints
        .filter((entry) => !entry.reversal)
        .map((entry) => ({
          userId: entry.userId,
          eventId: entry.eventId,
          ruleVersion: entry.ruleVersion,
          activityId,
          amount: -entry.amount,
          reversal: true,
        })),
    });
    const updated = await tx.activity.update({
      where: { id: activityId },
      data: { state: "REVERSED", reviewReason: value.reason },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "ACTIVITY_REVERSED",
        targetId: activityId,
        details: value,
      },
    });
    return { activity: updated };
  });
}
