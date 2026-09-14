import {
  BASIS_POINTS,
  EconomicError,
  freezeDeep,
  requireBps,
  requireIdentifier,
  requireNonnegative,
} from "./shared";

export const LIABILITY_KEYS = [
  "providerFeesMinor",
  "taxLiabilityMinor",
  "refundsMinor",
  "chargebacksMinor",
  "fraudLossesMinor",
  "campaignLiabilitiesMinor",
  "userRewardsMinor",
  "creatorRewardsMinor",
  "advertiserRewardsMinor",
  "referralAllocationsMinor",
  "eventLiabilitiesMinor",
  "prizePoolsMinor",
  "infrastructureMinor",
  "otherOperatingCostsMinor",
] as const;
export type LiabilityKey = (typeof LIABILITY_KEYS)[number];
export type MarginLiabilities = Readonly<Partial<Record<LiabilityKey, bigint>>>;
export interface MarginRule {
  readonly version: string;
  readonly minimumRetainedBps: number;
  readonly operatingReserveMinor: bigint;
  readonly minimumOperatingProfitMinor: bigint;
  readonly targetOperatingProfitMinor: bigint;
  readonly mode: "REDUCE" | "BLOCK";
}
export interface MarginInput {
  readonly grossEligibleRevenueMinor: bigint;
  readonly requestedPoolMinor: bigint;
  readonly liabilities: MarginLiabilities;
  readonly rule: MarginRule;
}
export interface MarginDecision {
  readonly ruleVersion: string;
  readonly grossEligibleRevenueMinor: bigint;
  readonly requestedPoolMinor: bigint;
  readonly liabilitiesMinor: bigint;
  readonly reserveMinor: bigint;
  readonly requiredRetainedMinor: bigint;
  readonly affordablePoolMinor: bigint;
  readonly allowedPoolMinor: bigint;
  readonly estimatedOperatingProfitMinor: bigint;
  readonly targetOperatingProfitMinor: bigint;
  readonly status: "APPROVED" | "REDUCED" | "BLOCKED";
  readonly reasons: readonly string[];
}

export function evaluateMarginGovernor(input: MarginInput): Readonly<MarginDecision> {
  const { rule } = input;
  requireIdentifier(rule.version, "margin rule version");
  requireBps(rule.minimumRetainedBps, "minimum retained margin");
  if (!["REDUCE", "BLOCK"].includes(rule.mode)) throw new EconomicError("INVALID_MARGIN_MODE");
  for (const [field, amount] of Object.entries({
    gross: input.grossEligibleRevenueMinor,
    requested: input.requestedPoolMinor,
    reserve: rule.operatingReserveMinor,
    minimumProfit: rule.minimumOperatingProfitMinor,
    targetProfit: rule.targetOperatingProfitMinor,
  }))
    requireNonnegative(amount, field);
  for (const key of Object.keys(input.liabilities))
    if (!(LIABILITY_KEYS as readonly string[]).includes(key))
      throw new EconomicError("UNKNOWN_LIABILITY", key);
  const liabilitiesMinor = LIABILITY_KEYS.reduce((sum, key) => {
    const amount = input.liabilities[key] ?? 0n;
    requireNonnegative(amount, key);
    return sum + amount;
  }, 0n);
  // Round the safety floor up, so sub-cent arithmetic cannot erode the reserve.
  const marginFloor =
    (input.grossEligibleRevenueMinor * BigInt(rule.minimumRetainedBps) + BASIS_POINTS - 1n) /
    BASIS_POINTS;
  const requiredRetainedMinor =
    marginFloor > rule.minimumOperatingProfitMinor ? marginFloor : rule.minimumOperatingProfitMinor;
  const remaining =
    input.grossEligibleRevenueMinor -
    liabilitiesMinor -
    rule.operatingReserveMinor -
    requiredRetainedMinor;
  const affordablePoolMinor = remaining > 0n ? remaining : 0n;
  const constrained = input.requestedPoolMinor > affordablePoolMinor || remaining < 0n;
  const allowedPoolMinor = constrained
    ? rule.mode === "BLOCK"
      ? 0n
      : affordablePoolMinor
    : input.requestedPoolMinor;
  const status = constrained ? (allowedPoolMinor === 0n ? "BLOCKED" : "REDUCED") : "APPROVED";
  const reasons = constrained
    ? [remaining < 0n ? "EXISTING_LIABILITIES_EXCEED_CAPACITY" : "RETAINED_MARGIN_FLOOR"]
    : [];
  return freezeDeep({
    ruleVersion: rule.version,
    grossEligibleRevenueMinor: input.grossEligibleRevenueMinor,
    requestedPoolMinor: input.requestedPoolMinor,
    liabilitiesMinor,
    reserveMinor: rule.operatingReserveMinor,
    requiredRetainedMinor,
    affordablePoolMinor,
    allowedPoolMinor,
    estimatedOperatingProfitMinor:
      input.grossEligibleRevenueMinor - liabilitiesMinor - allowedPoolMinor,
    targetOperatingProfitMinor: rule.targetOperatingProfitMinor,
    status,
    reasons,
  });
}
