import {
  EconomicError,
  freezeDeep,
  isoInstant,
  requireIdentifier,
  requireSafeCount,
} from "../economy/shared";

export type Role = "USER" | "CREATOR" | "ADVERTISER" | "ADMIN";
export type PolicyFeature =
  | "PUBLIC_PROFILE"
  | "PARTICIPATE"
  | "CREATOR_MONETIZATION"
  | "ADVERTISE"
  | "EVENT_JOIN"
  | "DISTRIBUTION"
  | "PAYOUT"
  | "ADMINISTRATION";
export interface PolicySubject {
  readonly id: string;
  readonly roles: readonly Role[];
  readonly country?: string | null;
  readonly region?: string | null;
  readonly birthDate?: string | null;
  readonly suspended: boolean;
  readonly economicHold: boolean;
  readonly creatorFollowerCount?: number;
  readonly creatorApproved?: boolean;
  readonly advertiserApproved?: boolean;
  readonly kycVerified?: boolean;
  readonly kybVerified?: boolean;
}
export interface PolicyRule {
  readonly version: string;
  readonly minimumAge: number;
  readonly allowedCountries: readonly string[];
  readonly blockedRegions: readonly string[];
  readonly minimumCreatorFollowers: number;
  readonly requireCreatorReview: boolean;
  readonly requireAdvertiserReview: boolean;
  readonly requireKycForPayout: boolean;
  readonly requireKybForAdvertising: boolean;
  readonly paymentProviderCountries: readonly string[];
  readonly enabledFeatures: readonly PolicyFeature[];
}
export interface PolicyDecision {
  readonly allowed: boolean;
  readonly ruleVersion: string;
  readonly reasons: readonly string[];
}
const ECONOMIC_FEATURES: readonly PolicyFeature[] = [
  "PARTICIPATE",
  "CREATOR_MONETIZATION",
  "ADVERTISE",
  "EVENT_JOIN",
  "DISTRIBUTION",
  "PAYOUT",
];
const REQUIRED_ROLES: Readonly<Partial<Record<PolicyFeature, Role>>> = {
  CREATOR_MONETIZATION: "CREATOR",
  ADVERTISE: "ADVERTISER",
  ADMINISTRATION: "ADMIN",
};

function ageAt(birthDate: string | null | undefined, asOf: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const birthday = new Date(`${birthDate}T00:00:00.000Z`);
  if (!Number.isFinite(birthday.getTime()) || birthday.toISOString().slice(0, 10) !== birthDate)
    return null;
  const currentDate = asOf.slice(0, 10);
  if (birthDate > currentDate) return null;
  let age = Number(currentDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (currentDate.slice(5) < birthDate.slice(5)) age -= 1;
  return age;
}

/** Server-side policy gate. Unknown identity/age/geo fails closed for economics.
 * Configuration expresses product policy, not legal certification. */
export function evaluatePolicy(
  subject: PolicySubject,
  feature: PolicyFeature,
  rule: PolicyRule,
  asOf: string,
): Readonly<PolicyDecision> {
  requireIdentifier(subject.id, "policy subject");
  requireIdentifier(rule.version, "policy version");
  requireSafeCount(rule.minimumAge, "minimum age");
  requireSafeCount(rule.minimumCreatorFollowers, "creator threshold");
  isoInstant(asOf, "policy evaluation time");
  const reasons: string[] = [];
  if (!rule.enabledFeatures.includes(feature)) reasons.push("FEATURE_DISABLED");
  if (subject.suspended) reasons.push("ACCOUNT_SUSPENDED");
  const role = REQUIRED_ROLES[feature];
  if (role && !subject.roles.includes(role)) reasons.push("ROLE_REQUIRED");
  if (ECONOMIC_FEATURES.includes(feature)) {
    if (subject.economicHold) reasons.push("ECONOMIC_HOLD");
    const age = ageAt(subject.birthDate, asOf);
    if (age === null) reasons.push("AGE_UNVERIFIED");
    else if (age < rule.minimumAge) reasons.push("MINIMUM_AGE");
    if (!subject.country || !rule.allowedCountries.includes(subject.country.toUpperCase()))
      reasons.push("COUNTRY_UNAVAILABLE");
    if (subject.region && rule.blockedRegions.includes(subject.region.toUpperCase()))
      reasons.push("REGION_UNAVAILABLE");
  }
  if (feature === "CREATOR_MONETIZATION") {
    const count = subject.creatorFollowerCount ?? 0;
    requireSafeCount(count, "creator followers");
    if (count < rule.minimumCreatorFollowers) reasons.push("CREATOR_THRESHOLD");
    if (rule.requireCreatorReview && !subject.creatorApproved)
      reasons.push("CREATOR_REVIEW_REQUIRED");
  }
  if (feature === "ADVERTISE") {
    if (rule.requireAdvertiserReview && !subject.advertiserApproved)
      reasons.push("ADVERTISER_REVIEW_REQUIRED");
    if (rule.requireKybForAdvertising && !subject.kybVerified) reasons.push("KYB_REQUIRED");
  }
  if (feature === "PAYOUT") {
    if (rule.requireKycForPayout && !subject.kycVerified) reasons.push("KYC_REQUIRED");
    if (!subject.country || !rule.paymentProviderCountries.includes(subject.country.toUpperCase()))
      reasons.push("PAYMENT_PROVIDER_UNAVAILABLE");
  }
  return freezeDeep({ allowed: reasons.length === 0, ruleVersion: rule.version, reasons });
}

export function assertRole(roles: readonly Role[], required: Role): void {
  if (!roles.includes(required)) throw new EconomicError("FORBIDDEN", `${required} role required`);
}

export interface PersistedPolicySubject {
  readonly onboarded: boolean;
  /** Self-declared adult attestation captured at onboarding; not verified DOB. */
  readonly ageEligible: boolean;
  readonly termsAcceptedAt: Date | null;
  readonly country: string | null;
  readonly suspended: boolean;
  readonly economicHold: boolean;
  readonly roles: readonly string[];
  readonly followers: number;
}
export type PersistedPolicyFeature = "PARTICIPATION" | "CREATOR_MONETIZATION" | "DISTRIBUTION";

/** Adapter for the P0 database's privacy-minimizing adult-attestation model.
 * All inputs must come from a freshly loaded server-owned account and rule.
 * This does not claim externally verified age, KYC, or legal certification. */
export function evaluatePersistedPolicy(
  subject: PersistedPolicySubject,
  feature: PersistedPolicyFeature,
  rule: { readonly allowedCountries: readonly string[]; readonly creatorFollowerThreshold: number },
): Readonly<{ eligible: boolean; reasons: readonly string[] }> {
  requireSafeCount(rule.creatorFollowerThreshold, "creator threshold");
  const reasons: string[] = [];
  if (!subject.onboarded) reasons.push("ONBOARDING_REQUIRED");
  if (!subject.ageEligible) reasons.push("ADULT_ATTESTATION_REQUIRED");
  if (!subject.termsAcceptedAt || !Number.isFinite(subject.termsAcceptedAt.getTime()))
    reasons.push("TERMS_ACCEPTANCE_REQUIRED");
  if (!subject.country || !rule.allowedCountries.includes(subject.country.toUpperCase()))
    reasons.push("COUNTRY_UNAVAILABLE");
  if (subject.suspended) reasons.push("ACCOUNT_SUSPENDED");
  if (subject.economicHold) reasons.push("ECONOMIC_HOLD");
  if (feature === "CREATOR_MONETIZATION") {
    requireSafeCount(subject.followers, "creator followers");
    if (!subject.roles.includes("CREATOR")) reasons.push("CREATOR_ROLE_REQUIRED");
    if (subject.followers < rule.creatorFollowerThreshold) reasons.push("CREATOR_THRESHOLD");
  }
  return freezeDeep({ eligible: reasons.length === 0, reasons });
}
