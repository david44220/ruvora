import type { AttributionContext, User } from "@prisma/client";
import { z } from "zod";
import { calculateReferralReward } from "../domains/economy/referrals";
import { referralWouldLoop } from "../domains/economy/attribution";
import { evaluatePersistedPolicy } from "../domains/policy";
import { jsonValue, type Tx } from "./db";
import { assert } from "./errors";
import { activeRules, referralPolicySchema } from "./rules";
import { isDevelopment } from "./environment";

/** One server-attributed parent, attached only during account creation; signup creates no RU. */
export async function establishDirectReferral(tx: Tx, context: AttributionContext, invitee: User) {
  assert(
    context.referrerId && context.boundUserId === invitee.id,
    "REFERRAL_CONTEXT_REQUIRED",
    "A bound referral context is required.",
    403,
  );
  assert(
    context.referrerId !== invitee.id,
    "SELF_REFERRAL",
    "An account cannot refer itself.",
    403,
  );
  assert(
    invitee.createdAt >= context.firstTouchAt && invitee.createdAt <= context.expiresAt,
    "REFERRAL_ACCOUNT_EXISTS",
    "Referral attribution must precede account creation.",
    409,
  );
  const provenance = z
    .object({ referralOriginShareLinkId: z.string().optional() })
    .parse(context.policySnapshot);
  const entry = await tx.shareLink.findUnique({
    where: { id: provenance.referralOriginShareLinkId ?? context.shareLinkId },
  });
  assert(
    entry?.active &&
      entry.source === "REFERRAL" &&
      entry.referrerId === context.referrerId &&
      entry.ownerId === context.referrerId,
    "REFERRAL_CONTEXT_REQUIRED",
    "A trusted explicit referral entry is required.",
    403,
  );
  const existing = await tx.referral.findUnique({ where: { inviteeId: invitee.id } });
  if (existing) {
    assert(
      existing.inviterId === context.referrerId && existing.attributionId === context.id,
      "REFERRAL_ALREADY_BOUND",
      "A direct referral cannot change its originating account.",
      409,
    );
    return false;
  }
  const ancestors: string[] = [];
  let next: string | undefined = context.referrerId;
  for (let depth = 0; next && depth < 100; depth++) {
    assert(!ancestors.includes(next), "REFERRAL_LOOP", "Referral cycles are not allowed.", 409);
    ancestors.push(next);
    const parent: { inviterId: string } | null = await tx.referral.findUnique({
      where: { inviteeId: next },
      select: { inviterId: true },
    });
    next = parent?.inviterId;
  }
  assert(
    !next && !referralWouldLoop(context.referrerId, invitee.id, ancestors),
    "REFERRAL_LOOP",
    "Referral cycles or unbounded ancestry are not allowed.",
    409,
  );
  const { config } = await activeRules(tx);
  const inviter = await tx.user.findUniqueOrThrow({ where: { id: context.referrerId } });
  assert(
    evaluatePersistedPolicy(inviter, "PARTICIPATION", config).eligible,
    "REFERRER_INELIGIBLE",
    "The referrer is not eligible.",
    403,
  );
  const captured = z
    .object({ referral: referralPolicySchema })
    .parse(context.policySnapshot).referral;
  const referral = await tx.referral.create({
    data: {
      inviterId: inviter.id,
      inviteeId: invitee.id,
      attributionId: context.id,
      ruleSnapshot: jsonValue(captured),
      expiresAt: new Date(invitee.createdAt.getTime() + captured.windowDays * 86400000),
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: invitee.id,
      action: "DIRECT_REFERRAL_BOUND",
      targetId: referral.id,
      details: {
        attributionId: context.id,
        ruleVersion: captured.version,
        source: context.source,
        signupRewardMicros: "0",
      },
    },
  });
  return true;
}

/** Caller already validated/billed the activity. Lifetime minted credits count against caps even after reversal. */
export async function awardReferralForActivity(
  tx: Tx,
  activity: { id: string; userId: string; campaignId: string },
  sourceUserRuMicros: bigint,
) {
  const referral = await tx.referral.findUnique({
    where: { inviteeId: activity.userId },
    include: { inviter: true, attribution: { select: { status: true } } },
  });
  if (
    !referral?.attributionId ||
    !referral.ruleSnapshot ||
    !referral.expiresAt ||
    referral.expiresAt <= new Date()
  )
    return null;
  const rule = referralPolicySchema.parse(referral.ruleSnapshot);
  const { config } = await activeRules(tx);
  if (!rule.enabled || !config.referral.enabled) return null;
  const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: activity.campaignId } });
  if (
    referral.attribution?.status === "REVOKED" ||
    referral.inviterId === campaign.advertiserId ||
    referral.inviterId === activity.userId ||
    !evaluatePersistedPolicy(referral.inviter, "PARTICIPATION", config).eligible ||
    (!isDevelopment() && referral.inviter.isDemo)
  ) {
    await tx.auditLog.create({
      data: {
        action: "REFERRAL_CREDIT_INELIGIBLE",
        targetId: activity.id,
        details: { referralId: referral.id, reason: "SELF_OR_POLICY_INELIGIBLE" },
      },
    });
    return null;
  }
  // A shared recipient row serializes aggregate cap decisions across distinct referees.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${referral.inviterId} FOR UPDATE`;
  const periodKey = new Date().toISOString().slice(0, 7);
  const credits = await tx.referralCredit.findMany({
    where: { periodKey, referral: { inviterId: referral.inviterId } },
    include: { referral: { select: { inviteeId: true } } },
  });
  const award = calculateReferralReward(
    {
      referrerId: referral.inviterId,
      refereeId: activity.userId,
      activityId: activity.id,
      sourceCategory: "USER",
      sourceRuMicros: sourceUserRuMicros,
      sourceValidated: true,
      policyAllowed: true,
      sharedVerifiedIdentity: false,
      alreadyRewarded: Boolean(
        await tx.referralCredit.findUnique({ where: { activityId: activity.id } }),
      ),
      earnedThisPeriodMicros: credits.reduce((sum, credit) => sum + credit.amountMicros, 0n),
      qualifyingRefereesThisPeriod: new Set(credits.map((credit) => credit.referral.inviteeId))
        .size,
      refereeAlreadyQualifiedThisPeriod: credits.some(
        (credit) => credit.referral.inviteeId === activity.userId,
      ),
    },
    rule,
  );
  if (award.amountMicros === 0n) {
    await tx.auditLog.create({
      data: {
        action: "REFERRAL_CREDIT_SKIPPED",
        targetId: activity.id,
        details: {
          referralId: referral.id,
          reasons: [...award.reasons],
          ruleVersion: rule.version,
        },
      },
    });
    return null;
  }
  const unit = await tx.rewardUnit.create({
    data: {
      activityId: activity.id,
      userId: award.userId,
      category: "REFERRAL",
      amountMicros: award.amountMicros,
      ruleVersion: rule.version,
    },
  });
  await tx.referralCredit.create({
    data: {
      referralId: referral.id,
      activityId: activity.id,
      rewardUnitId: unit.id,
      periodKey,
      amountMicros: award.amountMicros,
      ruleVersion: rule.version,
    },
  });
  if (referral.state === "PENDING")
    await tx.referral.update({ where: { id: referral.id }, data: { state: "QUALIFIED" } });
  await tx.auditLog.create({
    data: {
      action: "REFERRAL_CREDIT_VALIDATED",
      targetId: activity.id,
      details: jsonValue({ referralId: referral.id, unitId: unit.id, award, periodKey }),
    },
  });
  return unit;
}
