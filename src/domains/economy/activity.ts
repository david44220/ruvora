import {
  ActivityType,
  EconomicError,
  freezeDeep,
  isoInstant,
  ParticipantCategory,
  requireIdentifier,
  requireNonnegative,
  requireSafeCount,
} from "./shared";

export type ActivityState =
  "RECEIVED" | "PENDING_VALIDATION" | "VALIDATED" | "REJECTED" | "REVERSED";
export interface ActivityValidationInput {
  readonly participantId: string;
  readonly advertiserId: string;
  readonly authenticated: boolean;
  readonly policyAllowed: boolean;
  readonly campaignStatus: string;
  readonly type: ActivityType;
  readonly allowedTypes: readonly ActivityType[];
  readonly occurredAt: string;
  readonly campaignStartAt: string;
  readonly campaignEndAt: string;
  readonly duplicate: boolean;
  readonly priorActivityCount: number;
  readonly frequencyCap: number;
  readonly billableMinor: bigint;
  readonly remainingBudgetMinor: bigint;
  readonly dailyRemainingMinor?: bigint;
  readonly riskScore: number;
  readonly reviewThreshold: number;
  readonly conversionEvidenceVerified?: boolean;
}
export interface ActivityDecision {
  readonly state: "VALIDATED" | "REJECTED" | "PENDING_VALIDATION";
  readonly reasons: readonly string[];
}

/** All signals must come from trusted server state; a browser cannot validate itself. */
export function validateActivity(input: ActivityValidationInput): Readonly<ActivityDecision> {
  requireIdentifier(input.participantId, "participant");
  requireIdentifier(input.advertiserId, "advertiser");
  requireNonnegative(input.billableMinor, "billable cost");
  requireNonnegative(input.remainingBudgetMinor, "campaign budget");
  if (input.dailyRemainingMinor !== undefined)
    requireNonnegative(input.dailyRemainingMinor, "daily budget");
  for (const [field, value] of Object.entries({
    priorActivityCount: input.priorActivityCount,
    frequencyCap: input.frequencyCap,
    riskScore: input.riskScore,
    reviewThreshold: input.reviewThreshold,
  }))
    requireSafeCount(value, field);
  const occurredAt = isoInstant(input.occurredAt, "activity time");
  const startAt = isoInstant(input.campaignStartAt, "campaign start");
  const endAt = isoInstant(input.campaignEndAt, "campaign end");
  if (startAt >= endAt) throw new EconomicError("INVALID_CAMPAIGN_WINDOW");
  const reasons: string[] = [];
  if (!input.authenticated) reasons.push("AUTHENTICATION_REQUIRED");
  if (!input.policyAllowed) reasons.push("POLICY_INELIGIBLE");
  if (input.participantId === input.advertiserId) reasons.push("SELF_PARTICIPATION");
  if (input.campaignStatus !== "ACTIVE") reasons.push("CAMPAIGN_INACTIVE");
  if (!input.allowedTypes.includes(input.type)) reasons.push("ACTIVITY_TYPE_INELIGIBLE");
  if (occurredAt < startAt || occurredAt >= endAt) reasons.push("OUTSIDE_CAMPAIGN_WINDOW");
  if (input.duplicate) reasons.push("DUPLICATE_ACTIVITY");
  if (input.priorActivityCount >= input.frequencyCap) reasons.push("FREQUENCY_CAP");
  if (input.billableMinor === 0n) reasons.push("NO_BILLABLE_ACTIVITY");
  if (
    input.billableMinor > input.remainingBudgetMinor ||
    (input.dailyRemainingMinor !== undefined && input.billableMinor > input.dailyRemainingMinor)
  )
    reasons.push("CAMPAIGN_BUDGET_EXCEEDED");
  if (input.type === "CONVERSION" && !input.conversionEvidenceVerified)
    reasons.push("CONVERSION_EVIDENCE_REQUIRED");
  if (reasons.length) return freezeDeep({ state: "REJECTED", reasons });
  if (input.riskScore >= input.reviewThreshold)
    return freezeDeep({ state: "PENDING_VALIDATION", reasons: ["RISK_REVIEW_REQUIRED"] });
  return freezeDeep({ state: "VALIDATED", reasons: [] });
}

export interface ActivityRewardRate {
  readonly userRuMicros: bigint;
  readonly creatorRuMicros: bigint;
  readonly advertiserRuMicrosPerMinor: bigint;
  readonly xp: number;
  readonly eventPoints: number;
}
export interface RewardRule {
  readonly version: string;
  readonly rates: Readonly<Partial<Record<ActivityType, ActivityRewardRate>>>;
}
/** Seed configuration only; economic operators should persist/version their own rules. */
export const DEVELOPMENT_REWARD_RULE: RewardRule = freezeDeep({
  version: "development-rewards-v1",
  rates: {
    QUALIFIED_VIEW: {
      userRuMicros: 250_000n,
      creatorRuMicros: 100_000n,
      advertiserRuMicrosPerMinor: 20_000n,
      xp: 40,
      eventPoints: 15,
    },
    CLICK: {
      userRuMicros: 100_000n,
      creatorRuMicros: 50_000n,
      advertiserRuMicrosPerMinor: 10_000n,
      xp: 10,
      eventPoints: 5,
    },
    CONVERSION: {
      userRuMicros: 1_000_000n,
      creatorRuMicros: 500_000n,
      advertiserRuMicrosPerMinor: 50_000n,
      xp: 100,
      eventPoints: 50,
    },
  },
});
export interface RewardActivity {
  readonly activityId: string;
  readonly type: ActivityType;
  readonly state: ActivityState;
  readonly billableMinor: bigint;
  readonly participantId: string;
  readonly advertiserId: string;
  readonly creatorId?: string;
  readonly eventId?: string;
}
export interface ActivityUnitAward {
  readonly userId: string;
  readonly activityId: string;
  readonly category: ParticipantCategory;
  readonly amountMicros: bigint;
  readonly ruleVersion: string;
}
export interface ActivityRewards {
  readonly units: readonly ActivityUnitAward[];
  readonly xp: { readonly userId: string; readonly amount: number };
  readonly eventPoints?: {
    readonly userId: string;
    readonly eventId: string;
    readonly amount: number;
  };
}

/** No funding/deposit input exists: only persisted validated billable activity qualifies. */
export function calculateActivityRewards(
  activity: RewardActivity,
  rule: RewardRule = DEVELOPMENT_REWARD_RULE,
): Readonly<ActivityRewards> {
  requireIdentifier(activity.activityId, "activity");
  requireIdentifier(activity.participantId, "participant");
  requireIdentifier(activity.advertiserId, "advertiser");
  requireIdentifier(rule.version, "reward rule version");
  requireNonnegative(activity.billableMinor, "billable cost");
  if (activity.creatorId) requireIdentifier(activity.creatorId, "creator");
  if (activity.eventId) requireIdentifier(activity.eventId, "event");
  const empty = { units: [], xp: { userId: activity.participantId, amount: 0 } };
  if (
    activity.state !== "VALIDATED" ||
    activity.billableMinor === 0n ||
    activity.participantId === activity.advertiserId
  )
    return freezeDeep(empty);
  const rate = rule.rates[activity.type];
  if (!rate) return freezeDeep(empty);
  for (const [field, amount] of Object.entries({
    userRuMicros: rate.userRuMicros,
    creatorRuMicros: rate.creatorRuMicros,
    advertiserRuMicrosPerMinor: rate.advertiserRuMicrosPerMinor,
  }))
    requireNonnegative(amount, field);
  requireSafeCount(rate.xp, "xp");
  requireSafeCount(rate.eventPoints, "event points");
  const units: ActivityUnitAward[] = [];
  function award(userId: string, category: ParticipantCategory, amountMicros: bigint) {
    if (amountMicros > 0n)
      units.push({
        userId,
        category,
        amountMicros,
        activityId: activity.activityId,
        ruleVersion: rule.version,
      });
  }
  award(activity.participantId, "USER", rate.userRuMicros);
  if (
    activity.creatorId &&
    activity.creatorId !== activity.advertiserId &&
    activity.creatorId !== activity.participantId
  )
    award(activity.creatorId, "CREATOR", rate.creatorRuMicros);
  award(
    activity.advertiserId,
    "ADVERTISER",
    activity.billableMinor * rate.advertiserRuMicrosPerMinor,
  );
  return freezeDeep({
    units,
    xp: { userId: activity.participantId, amount: rate.xp },
    ...(activity.eventId
      ? {
          eventPoints: {
            userId: activity.participantId,
            eventId: activity.eventId,
            amount: rate.eventPoints,
          },
        }
      : {}),
  });
}

const ACTIVITY_TRANSITIONS: Readonly<Record<ActivityState, readonly ActivityState[]>> = {
  RECEIVED: ["PENDING_VALIDATION", "REJECTED"],
  PENDING_VALIDATION: ["VALIDATED", "REJECTED"],
  VALIDATED: ["REVERSED"],
  REJECTED: [],
  REVERSED: [],
};
export function assertActivityTransition(from: ActivityState, to: ActivityState): void {
  if (!ACTIVITY_TRANSITIONS[from]?.includes(to))
    throw new EconomicError("INVALID_ACTIVITY_TRANSITION", `${from} -> ${to}`);
}
