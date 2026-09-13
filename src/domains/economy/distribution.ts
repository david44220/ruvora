import { buildBalancedTransaction, LedgerTransaction } from "./ledger";
import { evaluateMarginGovernor, MarginDecision, MarginLiabilities, MarginRule } from "./margin";
import {
  BASIS_POINTS,
  canonicalPayload,
  CATEGORIES,
  compareIds,
  EconomicError,
  freezeDeep,
  isoInstant,
  ParticipantCategory,
  requireBps,
  requireIdentifier,
  requireNonnegative,
} from "./shared";

export interface WeightedShare {
  readonly key: string;
  readonly weight: bigint;
}
/** Hamilton allocation with code-point-stable IDs as the final tie-break. */
export function allocateLargestRemainder(
  totalMinor: bigint,
  weights: readonly WeightedShare[],
): Readonly<Record<string, bigint>> {
  requireNonnegative(totalMinor, "allocation total");
  const seen = new Set<string>();
  let totalWeight = 0n;
  for (const item of weights) {
    requireIdentifier(item.key, "allocation key");
    requireNonnegative(item.weight, "allocation weight");
    if (seen.has(item.key)) throw new EconomicError("DUPLICATE_ALLOCATION_KEY");
    seen.add(item.key);
    totalWeight += item.weight;
  }
  if (totalWeight === 0n && totalMinor > 0n) throw new EconomicError("NO_ALLOCATION_WEIGHT");
  const shares = weights.map((item) => ({
    key: item.key,
    amount: totalWeight ? (totalMinor * item.weight) / totalWeight : 0n,
    remainder: totalWeight ? (totalMinor * item.weight) % totalWeight : 0n,
  }));
  let undistributed = totalMinor - shares.reduce((sum, share) => sum + share.amount, 0n);
  shares.sort((a, b) =>
    a.remainder === b.remainder ? compareIds(a.key, b.key) : a.remainder > b.remainder ? -1 : 1,
  );
  for (const share of shares) {
    if (undistributed === 0n) break;
    share.amount += 1n;
    undistributed -= 1n;
  }
  if (undistributed !== 0n) throw new EconomicError("ALLOCATION_INVARIANT_FAILED");
  // Null prototype prevents special participant IDs from changing object behavior.
  const result: Record<string, bigint> = Object.create(null) as Record<string, bigint>;
  for (const share of shares) result[share.key] = share.amount;
  return freezeDeep(result);
}

export interface DistributionRule {
  readonly version: string;
  readonly poolBps: number;
  readonly categoryWeightsBps: Readonly<Record<ParticipantCategory, number>>;
}
export interface DistributionParticipant {
  readonly userId: string;
  readonly category: ParticipantCategory;
  readonly amountMicros: bigint;
  readonly eligible: boolean;
  readonly eligibilityReasons?: readonly string[];
  readonly unitIds: readonly string[];
}
export interface DistributionInput {
  readonly periodId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly eligibleRevenueMinor: bigint;
  readonly rule: DistributionRule;
  readonly participants: readonly DistributionParticipant[];
  readonly margin: { readonly liabilities: MarginLiabilities; readonly rule: MarginRule };
}
export interface DistributionAllocation {
  readonly userId: string;
  readonly category: ParticipantCategory;
  readonly amountMinor: bigint;
  readonly amountMicros: bigint;
  readonly unitIds: readonly string[];
}
export interface CategoryDistribution {
  readonly category: ParticipantCategory;
  readonly weightBps: number;
  readonly totalMicros: bigint;
  readonly allocatedMinor: bigint;
  readonly distributedMinor: bigint;
}
export interface DistributionPreview {
  readonly state: "PREVIEW";
  readonly periodId: string;
  readonly ruleVersion: string;
  readonly snapshot: Readonly<DistributionInput>;
  readonly requestedPoolMinor: bigint;
  readonly fundedPoolMinor: bigint;
  readonly distributedMinor: bigint;
  readonly undistributedMinor: bigint;
  readonly allocations: readonly DistributionAllocation[];
  readonly categoryTotals: readonly CategoryDistribution[];
  readonly marginDecision: Readonly<MarginDecision>;
  readonly payload: string;
}

export function previewDistribution(input: DistributionInput): Readonly<DistributionPreview> {
  requireIdentifier(input.periodId, "period id");
  requireIdentifier(input.rule.version, "distribution rule version");
  const startAt = isoInstant(input.startAt, "period start");
  const endAt = isoInstant(input.endAt, "period end");
  if (startAt >= endAt) throw new EconomicError("INVALID_PERIOD_WINDOW");
  requireNonnegative(input.eligibleRevenueMinor, "eligible revenue");
  requireBps(input.rule.poolBps, "pool percentage");
  if (Object.keys(input.rule.categoryWeightsBps).length !== CATEGORIES.length)
    throw new EconomicError("INVALID_CATEGORY_WEIGHTS");
  let totalBps = 0;
  for (const category of CATEGORIES) {
    const bps = input.rule.categoryWeightsBps[category];
    requireBps(bps, `${category} weight`);
    totalBps += bps;
  }
  if (totalBps !== 10_000) throw new EconomicError("CATEGORY_WEIGHTS_MUST_SUM_TO_10000");
  const participantKeys = new Set<string>();
  const unitIds = new Set<string>();
  const participants = input.participants
    .map((participant) => {
      requireIdentifier(participant.userId, "participant");
      if (!(CATEGORIES as readonly string[]).includes(participant.category))
        throw new EconomicError("INVALID_PARTICIPANT_CATEGORY");
      if (typeof participant.eligible !== "boolean") throw new EconomicError("INVALID_ELIGIBILITY");
      requireNonnegative(participant.amountMicros, "participant RU");
      const key = canonicalPayload([participant.category, participant.userId]);
      if (participantKeys.has(key)) throw new EconomicError("DUPLICATE_PARTICIPANT_CATEGORY");
      participantKeys.add(key);
      if (participant.amountMicros > 0n && participant.unitIds.length === 0)
        throw new EconomicError("MISSING_RU_PROVENANCE");
      for (const unitId of participant.unitIds) {
        requireIdentifier(unitId, "reward unit id");
        if (unitIds.has(unitId)) throw new EconomicError("DUPLICATE_REWARD_UNIT");
        unitIds.add(unitId);
      }
      return {
        ...participant,
        unitIds: [...participant.unitIds].sort(compareIds),
        eligibilityReasons: [...(participant.eligibilityReasons ?? [])].sort(compareIds),
      };
    })
    .sort((a, b) => compareIds(a.category, b.category) || compareIds(a.userId, b.userId));
  const snapshot: DistributionInput = {
    ...input,
    rule: { ...input.rule, categoryWeightsBps: { ...input.rule.categoryWeightsBps } },
    participants,
    margin: { rule: { ...input.margin.rule }, liabilities: { ...input.margin.liabilities } },
  };
  const requestedPoolMinor =
    (input.eligibleRevenueMinor * BigInt(input.rule.poolBps)) / BASIS_POINTS;
  const marginDecision = evaluateMarginGovernor({
    grossEligibleRevenueMinor: input.eligibleRevenueMinor,
    requestedPoolMinor,
    ...snapshot.margin,
  });
  const fundedPoolMinor = marginDecision.allowedPoolMinor;
  const categoryShares = allocateLargestRemainder(
    fundedPoolMinor,
    CATEGORIES.map((category) => ({
      key: category,
      weight: BigInt(input.rule.categoryWeightsBps[category]),
    })),
  );
  const allocations: DistributionAllocation[] = [];
  const categoryTotals: CategoryDistribution[] = [];
  for (const category of CATEGORIES) {
    const eligible = participants.filter(
      (participant) =>
        participant.category === category && participant.eligible && participant.amountMicros > 0n,
    );
    const totalMicros = eligible.reduce((sum, participant) => sum + participant.amountMicros, 0n);
    const allocatedMinor = categoryShares[category] ?? 0n;
    const shares =
      totalMicros > 0n
        ? allocateLargestRemainder(
            allocatedMinor,
            eligible.map((participant) => ({
              key: participant.userId,
              weight: participant.amountMicros,
            })),
          )
        : {};
    for (const participant of eligible)
      allocations.push({
        userId: participant.userId,
        category,
        amountMinor: shares[participant.userId] ?? 0n,
        amountMicros: participant.amountMicros,
        unitIds: [...participant.unitIds],
      });
    categoryTotals.push({
      category,
      weightBps: input.rule.categoryWeightsBps[category],
      totalMicros,
      allocatedMinor,
      distributedMinor: totalMicros > 0n ? allocatedMinor : 0n,
    });
  }
  const distributedMinor = allocations.reduce(
    (sum, allocation) => sum + allocation.amountMinor,
    0n,
  );
  const content = {
    state: "PREVIEW" as const,
    periodId: input.periodId,
    ruleVersion: input.rule.version,
    snapshot,
    requestedPoolMinor,
    fundedPoolMinor,
    distributedMinor,
    undistributedMinor: fundedPoolMinor - distributedMinor,
    allocations,
    categoryTotals,
    marginDecision,
  };
  return freezeDeep({ ...content, payload: canonicalPayload(content) });
}

export interface FinalizedDistribution {
  readonly state: "FINALIZED";
  readonly id: string;
  readonly finalizedAt: string;
  readonly preview: Readonly<DistributionPreview>;
  readonly transaction: Readonly<LedgerTransaction> | null;
  readonly consumedUnitIds: readonly string[];
}
/** Caller must lock the period, funding and included RU rows, recheck holds, and
 * persist the result plus postings plus consumed states atomically. */
export function finalizeDistribution(
  preview: DistributionPreview,
  input: {
    id: string;
    finalizedAt: string;
    idempotencyKey: string;
    fundingAccountKey: string;
    availableFundingMinor: bigint;
    accountForParticipant?: (userId: string) => string;
    alreadyFinalized?: boolean;
  },
): Readonly<FinalizedDistribution> {
  requireIdentifier(input.id, "distribution id");
  requireIdentifier(input.idempotencyKey, "idempotency key");
  requireIdentifier(input.fundingAccountKey, "funding account");
  isoInstant(input.finalizedAt, "finalization time");
  if (input.finalizedAt < preview.snapshot.endAt) throw new EconomicError("PERIOD_NOT_ENDED");
  if (input.alreadyFinalized) throw new EconomicError("PERIOD_ALREADY_FINALIZED");
  requireNonnegative(input.availableFundingMinor, "available funding");
  const recalculated = previewDistribution(preview.snapshot);
  const { payload: suppliedPayload, ...suppliedContent } = preview;
  if (
    recalculated.payload !== suppliedPayload ||
    canonicalPayload(suppliedContent) !== suppliedPayload
  )
    throw new EconomicError("PREVIEW_TAMPERED");
  if (recalculated.distributedMinor > input.availableFundingMinor)
    throw new EconomicError("INSUFFICIENT_DISTRIBUTION_FUNDING");
  const recipients = new Map<string, bigint>();
  for (const allocation of recalculated.allocations) {
    if (allocation.amountMinor === 0n) continue;
    const accountKey =
      input.accountForParticipant?.(allocation.userId) ?? `user:${allocation.userId}`;
    requireIdentifier(accountKey, "recipient account");
    if (accountKey === input.fundingAccountKey)
      throw new EconomicError("FUNDING_ACCOUNT_IS_RECIPIENT");
    recipients.set(accountKey, (recipients.get(accountKey) ?? 0n) + allocation.amountMinor);
  }
  const transaction =
    recalculated.distributedMinor > 0n
      ? buildBalancedTransaction({
          id: `distribution:${input.id}`,
          idempotencyKey: input.idempotencyKey,
          reference: `distribution:${preview.periodId}`,
          occurredAt: input.finalizedAt,
          entries: [
            { accountKey: input.fundingAccountKey, amountMinor: -recalculated.distributedMinor },
            ...[...recipients]
              .sort(([a], [b]) => compareIds(a, b))
              .map(([accountKey, amountMinor]) => ({ accountKey, amountMinor })),
          ],
        })
      : null;
  // Zero allocations are still the final outcome for an eligible category-period.
  // Ineligible/held participants are recorded in the snapshot but not consumed.
  const consumedUnitIds = recalculated.allocations
    .flatMap((allocation) => allocation.unitIds)
    .sort(compareIds);
  return freezeDeep({
    state: "FINALIZED",
    id: input.id,
    finalizedAt: input.finalizedAt,
    preview: recalculated,
    transaction,
    consumedUnitIds,
  });
}
