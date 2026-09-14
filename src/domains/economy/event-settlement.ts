import { z } from "zod";
import { allocateLargestRemainder } from "./distribution";
import { computeEventScores, type EventPointEntry } from "./events";
import {
  canonicalPayload,
  compareIds,
  EconomicError,
  freezeDeep,
  requireIdentifier,
  requireNonnegative,
} from "./shared";

const localizedText = z
  .object({ en: z.string().trim().min(1).max(500), fr: z.string().trim().min(1).max(500) })
  .strict();
export const eventConfigurationSchema = z
  .object({
    version: z.string().regex(/^[a-zA-Z0-9._:-]{1,100}$/),
    pointRules: z
      .object({
        IMPRESSION: z.number().int().min(0).max(1000000).default(0),
        QUALIFIED_VIEW: z.number().int().min(0).max(1000000).default(0),
        CLICK: z.number().int().min(0).max(1000000).default(0),
        CONVERSION: z.number().int().min(0).max(1000000).default(0),
        CREATOR_PROMOTION: z.number().int().min(0).max(1000000).default(0),
        SPONSORED_MISSION: z.number().int().min(0).max(1000000).default(0),
      })
      .strict(),
    maxPointsPerUserPerDay: z.number().int().min(1).max(10000000),
    participantCap: z.number().int().min(1).max(10000),
    allowedCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(250)
      .refine((a) => new Set(a).size === a.length),
    milestones: z
      .array(
        z.object({ points: z.number().int().min(1).max(100000000), title: localizedText }).strict(),
      )
      .max(20)
      .default([]),
    rewardTiers: z
      .array(
        z
          .object({
            fromRank: z.number().int().min(1).max(10000),
            toRank: z.number().int().min(1).max(10000),
            shareBps: z.number().int().min(1).max(10000),
          })
          .strict(),
      )
      .max(100),
    ruBonusBudgetMicros: z.literal("0"),
    unusedFunds: z.literal("RETURN_SPONSOR"),
  })
  .strict()
  .superRefine((value, ctx) => {
    let last = 0,
      share = 0;
    for (const tier of [...value.rewardTiers].sort((a, b) => a.fromRank - b.fromRank)) {
      if (
        tier.fromRank <= last ||
        tier.toRank < tier.fromRank ||
        tier.toRank > value.participantCap
      )
        ctx.addIssue({
          code: "custom",
          message: "Reward ranks must be disjoint, ordered ranges within the participant cap.",
        });
      last = tier.toRank;
      share += tier.shareBps;
    }
    if (share > 10000)
      ctx.addIssue({ code: "custom", message: "Prize shares cannot exceed the funded budget." });
    if (new Set(value.milestones.map((m) => m.points)).size !== value.milestones.length)
      ctx.addIssue({ code: "custom", message: "Milestone thresholds must be unique." });
  });
export type EventConfiguration = z.infer<typeof eventConfigurationSchema>;
export interface SettlementParticipant {
  userId: string;
  eligible: boolean;
  reasons: readonly string[];
}
export interface SettlementPoint extends EventPointEntry {
  ruleVersion: string;
}
export interface EventSettlementInput {
  eventId: string;
  ruleVersion: string;
  eligibilityPolicyVersion: string;
  configuration: EventConfiguration;
  prizeBudgetMinor: bigint;
  fundedMinor: bigint;
  pendingActivities: number;
  participants: readonly SettlementParticipant[];
  entries: readonly SettlementPoint[];
}
export function previewEventSettlement(input: EventSettlementInput) {
  requireIdentifier(input.eventId, "event");
  const configuration = eventConfigurationSchema.parse(input.configuration);
  if (input.ruleVersion !== configuration.version)
    throw new EconomicError("EVENT_RULE_VERSION_MISMATCH");
  requireNonnegative(input.prizeBudgetMinor, "prize budget");
  requireNonnegative(input.fundedMinor, "funded prize pool");
  if (input.pendingActivities !== 0) throw new EconomicError("EVENT_PENDING_ACTIVITY");
  if (input.fundedMinor < input.prizeBudgetMinor) throw new EconomicError("EVENT_UNDERFUNDED");
  const seen = new Set<string>();
  const participants = input.participants
    .map((p) => {
      requireIdentifier(p.userId, "participant");
      if (seen.has(p.userId)) throw new EconomicError("DUPLICATE_PARTICIPANT");
      seen.add(p.userId);
      if (typeof p.eligible !== "boolean") throw new EconomicError("INVALID_ELIGIBILITY");
      return { ...p, reasons: [...p.reasons].sort(compareIds) };
    })
    .sort((a, b) => compareIds(a.userId, b.userId));
  const entries = input.entries
    .map((p) => {
      if (!seen.has(p.userId)) throw new EconomicError("EVENT_POINT_WITHOUT_MEMBERSHIP");
      if (p.ruleVersion !== input.ruleVersion)
        throw new EconomicError("EVENT_POINT_VERSION_MISMATCH");
      return { ...p };
    })
    .sort((a, b) => compareIds(a.id, b.id));
  const scores = computeEventScores(input.eventId, entries);
  const excluded = participants.filter((p) => !p.eligible);
  const eligible = new Set(participants.filter((p) => p.eligible).map((p) => p.userId));
  const ranking = scores
    .filter((p) => p.points > 0 && eligible.has(p.userId))
    .map((p, index) => ({ ...p, rank: index + 1 }));
  const tiers = [...configuration.rewardTiers].sort((a, b) => a.fromRank - b.fromRank);
  const unusedBps = 10000 - tiers.reduce((sum, tier) => sum + tier.shareBps, 0);
  // First apportion the exact pool to tiers plus the disclosed unallocated share.
  // Then apportion each tier equally across ALL configured slots. Vacant slots refund.
  const tierKey = (rank: number) => `rank:${rank.toString().padStart(5, "0")}`;
  const shares = allocateLargestRemainder(input.prizeBudgetMinor, [
    ...tiers.map((t) => ({ key: tierKey(t.fromRank), weight: BigInt(t.shareBps) })),
    { key: "unused", weight: BigInt(unusedBps) },
  ]);
  const prizes = new Map<number, bigint>();
  for (const tier of tiers) {
    const slots = Array.from(
      { length: tier.toRank - tier.fromRank + 1 },
      (_, i) => tier.fromRank + i,
    );
    const awards = allocateLargestRemainder(
      shares[tierKey(tier.fromRank)]!,
      slots.map((rank) => ({ key: tierKey(rank), weight: 1n })),
    );
    for (const rank of slots) prizes.set(rank, awards[tierKey(rank)]!);
  }
  const allocations = ranking.map((p) => ({ ...p, amountMinor: prizes.get(p.rank) ?? 0n }));
  const awardedMinor = allocations.reduce((sum, p) => sum + p.amountMinor, 0n);
  const refundMinor = input.fundedMinor - awardedMinor;
  const snapshot = {
    ...input,
    configuration: {
      ...configuration,
      rewardTiers: tiers,
      allowedCountries: [...configuration.allowedCountries].sort(compareIds),
      milestones: [...configuration.milestones].sort((a, b) => a.points - b.points),
    },
    participants,
    entries,
  };
  const content = {
    state: "PREVIEW" as const,
    eventId: input.eventId,
    ruleVersion: input.ruleVersion,
    snapshot,
    ranking,
    excluded,
    allocations,
    awardedMinor,
    refundMinor,
    ruBonusMicros: 0n,
    tieBreak: "POINTS_DESC_ACHIEVED_AT_ASC_USER_ID_ASC" as const,
  };
  return freezeDeep({ ...content, payload: canonicalPayload(content) });
}

/** Platform revenue already excludes earmarked prize assets. Only a shortfall is
 * charged again against that revenue; the gross obligation and matched asset remain auditable. */
export function eventPrizeExposure(
  events: readonly { eventId: string; obligationMinor: bigint; fundedMinor: bigint }[],
) {
  const ids = new Set<string>();
  let obligationMinor = 0n,
    earmarkedAssetsMinor = 0n,
    unfundedLiabilityMinor = 0n;
  for (const event of events) {
    if (ids.has(event.eventId)) throw new EconomicError("DUPLICATE_EVENT_EXPOSURE");
    ids.add(event.eventId);
    requireNonnegative(event.obligationMinor, "event liability");
    requireNonnegative(event.fundedMinor, "event asset");
    obligationMinor += event.obligationMinor;
    earmarkedAssetsMinor += event.fundedMinor;
    if (event.obligationMinor > event.fundedMinor)
      unfundedLiabilityMinor += event.obligationMinor - event.fundedMinor;
  }
  return freezeDeep({ obligationMinor, earmarkedAssetsMinor, unfundedLiabilityMinor });
}
