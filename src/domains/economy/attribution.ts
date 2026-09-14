import { EconomicError, freezeDeep, requireIdentifier, requireSafeCount } from "./shared";

export interface AttributionPolicy {
  version: string;
  model: "FIRST_ELIGIBLE_CREATOR";
  windowSeconds: number;
  maxActivitiesPerContext: number;
  retentionDays: number;
}
export const DEFAULT_ATTRIBUTION_POLICY: AttributionPolicy = {
  version: "attribution-first-eligible-v1",
  model: "FIRST_ELIGIBLE_CREATOR",
  windowSeconds: 7 * 86400,
  maxActivitiesPerContext: 100,
  retentionDays: 90,
};
export function validateAttributionPolicy(policy: AttributionPolicy) {
  requireIdentifier(policy.version, "attribution version");
  requireSafeCount(policy.windowSeconds, "attribution window");
  requireSafeCount(policy.maxActivitiesPerContext, "attribution activity cap");
  requireSafeCount(policy.retentionDays, "attribution retention");
  if (
    policy.model !== "FIRST_ELIGIBLE_CREATOR" ||
    policy.windowSeconds < 60 ||
    policy.windowSeconds > 604800 ||
    policy.maxActivitiesPerContext < 1 ||
    policy.maxActivitiesPerContext > 1000 ||
    policy.retentionDays < 7 ||
    policy.retentionDays > 365
  )
    throw new EconomicError("INVALID_ATTRIBUTION_POLICY");
  return freezeDeep({ ...policy });
}
export function assertAttributionUse(input: {
  boundUserId: string | null;
  userId: string;
  creatorId: string | null;
  advertiserId: string;
  contextCampaignId: string | null;
  campaignId: string;
  contextEventId: string | null;
  eventId: string | null;
  firstTouchAt: Date;
  expiresAt: Date;
  occurredAt: Date;
  status: string;
  usedActivities: number;
  policy: AttributionPolicy;
}) {
  validateAttributionPolicy(input.policy);
  requireSafeCount(input.usedActivities, "attribution usage count");
  if (
    ![input.firstTouchAt, input.expiresAt, input.occurredAt].every((date) =>
      Number.isFinite(date.getTime()),
    ) ||
    input.expiresAt <= input.firstTouchAt
  )
    throw new EconomicError("ATTRIBUTION_EXPIRED");
  if (input.status !== "ACTIVE") throw new EconomicError("ATTRIBUTION_INACTIVE");
  if (!input.boundUserId || input.boundUserId !== input.userId)
    throw new EconomicError("ATTRIBUTION_ACCOUNT_MISMATCH");
  if (
    input.occurredAt < input.firstTouchAt ||
    input.occurredAt >= input.expiresAt ||
    input.expiresAt.getTime() - input.firstTouchAt.getTime() > input.policy.windowSeconds * 1000
  )
    throw new EconomicError("ATTRIBUTION_EXPIRED");
  if (
    input.creatorId &&
    (input.creatorId === input.userId || input.creatorId === input.advertiserId)
  )
    throw new EconomicError("SELF_ATTRIBUTION");
  if (input.contextCampaignId && input.contextCampaignId !== input.campaignId)
    throw new EconomicError("ATTRIBUTION_CAMPAIGN_MISMATCH");
  if (input.contextEventId && input.contextEventId !== input.eventId)
    throw new EconomicError("ATTRIBUTION_EVENT_MISMATCH");
  if (input.usedActivities >= input.policy.maxActivitiesPerContext)
    throw new EconomicError("ATTRIBUTION_USAGE_LIMIT");
}
export function referralWouldLoop(
  inviterId: string,
  inviteeId: string,
  ancestors: readonly string[],
) {
  return (
    inviterId === inviteeId ||
    ancestors.includes(inviteeId) ||
    new Set(ancestors).size !== ancestors.length
  );
}
