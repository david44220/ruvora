import {
  BASIS_POINTS,
  EconomicError,
  freezeDeep,
  ParticipantCategory,
  requireBps,
  requireIdentifier,
  requireNonnegative,
  requireSafeCount,
} from "./shared";

export interface ReferralRule {
  readonly version: string;
  readonly rewardBps: number;
  readonly maxRewardPerActivityMicros: bigint;
  readonly maxRewardPerReferrerPeriodMicros: bigint;
  readonly maxQualifyingRefereesPerPeriod: number;
}
export interface ReferralInput {
  readonly referrerId: string;
  readonly refereeId: string;
  readonly activityId: string;
  readonly sourceCategory: ParticipantCategory;
  readonly sourceRuMicros: bigint;
  readonly sourceValidated: boolean;
  readonly policyAllowed: boolean;
  readonly sharedVerifiedIdentity: boolean;
  readonly alreadyRewarded: boolean;
  readonly earnedThisPeriodMicros: bigint;
  readonly qualifyingRefereesThisPeriod: number;
  readonly refereeAlreadyQualifiedThisPeriod: boolean;
}
export interface ReferralAward {
  readonly userId: string;
  readonly activityId: string;
  readonly category: "REFERRAL";
  readonly ruleVersion: string;
  readonly amountMicros: bigint;
  readonly reasons: readonly string[];
}

/** One direct attribution only. No reward is based on downstream referral awards. */
export function calculateReferralReward(
  input: ReferralInput,
  rule: ReferralRule,
): Readonly<ReferralAward> {
  for (const [field, value] of Object.entries({
    referrer: input.referrerId,
    referee: input.refereeId,
    activity: input.activityId,
    version: rule.version,
  }))
    requireIdentifier(value, field);
  requireBps(rule.rewardBps, "referral percentage");
  for (const [field, amount] of Object.entries({
    source: input.sourceRuMicros,
    earned: input.earnedThisPeriodMicros,
    perActivityCap: rule.maxRewardPerActivityMicros,
    periodCap: rule.maxRewardPerReferrerPeriodMicros,
  }))
    requireNonnegative(amount, field);
  requireSafeCount(input.qualifyingRefereesThisPeriod, "qualifying referrals");
  requireSafeCount(rule.maxQualifyingRefereesPerPeriod, "referral count cap");
  if (!["USER", "CREATOR", "ADVERTISER", "REFERRAL"].includes(input.sourceCategory))
    throw new EconomicError("INVALID_REFERRAL_SOURCE");
  const reasons: string[] = [];
  if (input.referrerId === input.refereeId || input.sharedVerifiedIdentity)
    reasons.push("SELF_REFERRAL");
  if (!input.sourceValidated || input.sourceRuMicros === 0n)
    reasons.push("VALIDATED_SOURCE_REQUIRED");
  if (input.sourceCategory === "REFERRAL") reasons.push("MULTILEVEL_REFERRAL_DISALLOWED");
  if (!input.policyAllowed) reasons.push("POLICY_INELIGIBLE");
  if (input.alreadyRewarded) reasons.push("DUPLICATE_REFERRAL_REWARD");
  if (
    !input.refereeAlreadyQualifiedThisPeriod &&
    input.qualifyingRefereesThisPeriod >= rule.maxQualifyingRefereesPerPeriod
  )
    reasons.push("REFERRAL_COUNT_CAP");
  const remaining =
    rule.maxRewardPerReferrerPeriodMicros > input.earnedThisPeriodMicros
      ? rule.maxRewardPerReferrerPeriodMicros - input.earnedThisPeriodMicros
      : 0n;
  if (remaining === 0n) reasons.push("REFERRAL_PERIOD_CAP");
  let amountMicros = (input.sourceRuMicros * BigInt(rule.rewardBps)) / BASIS_POINTS;
  if (amountMicros > rule.maxRewardPerActivityMicros)
    amountMicros = rule.maxRewardPerActivityMicros;
  if (amountMicros > remaining) amountMicros = remaining;
  if (reasons.length) amountMicros = 0n;
  return freezeDeep({
    userId: input.referrerId,
    activityId: input.activityId,
    category: "REFERRAL",
    ruleVersion: rule.version,
    amountMicros,
    reasons,
  });
}
