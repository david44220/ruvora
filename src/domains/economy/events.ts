import {
  EconomicError,
  freezeDeep,
  compareIds,
  isoInstant,
  requireIdentifier,
  requireSafeCount,
} from "./shared";

export interface EventScore {
  readonly userId: string;
  readonly points: number;
  readonly achievedAt: string;
}
export interface RankedParticipant extends EventScore {
  readonly rank: number;
}

/** Highest score, earliest attainment, then stable user ID. One winner per rank. */
export function rankEventParticipants(
  participants: readonly EventScore[],
): readonly Readonly<RankedParticipant>[] {
  const seen = new Set<string>();
  for (const participant of participants) {
    requireIdentifier(participant.userId, "event participant");
    requireSafeCount(participant.points, "event score");
    isoInstant(participant.achievedAt, "score attainment");
    if (seen.has(participant.userId)) throw new EconomicError("DUPLICATE_EVENT_PARTICIPANT");
    seen.add(participant.userId);
  }
  return freezeDeep(
    [...participants]
      .sort(
        (a, b) =>
          b.points - a.points ||
          compareIds(a.achievedAt, b.achievedAt) ||
          compareIds(a.userId, b.userId),
      )
      .map((participant, index) => ({ ...participant, rank: index + 1 })),
  );
}

export interface EventPointEntry {
  readonly id: string;
  readonly eventId: string;
  readonly userId: string;
  readonly activityId: string;
  readonly points: number;
  readonly occurredAt: string;
  readonly reversalOf?: string;
}

export function reverseEventPoints(
  original: EventPointEntry,
  input: { id: string; occurredAt: string },
  alreadyReversed = false,
): Readonly<EventPointEntry> {
  requireIdentifier(input.id, "reversal id");
  isoInstant(input.occurredAt, "reversal time");
  if (alreadyReversed || original.reversalOf || original.points <= 0)
    throw new EconomicError("EVENT_POINTS_ALREADY_REVERSED");
  if (input.id === original.id) throw new EconomicError("SELF_REVERSAL");
  if (input.occurredAt < original.occurredAt) throw new EconomicError("REVERSAL_PRECEDES_ORIGIN");
  return freezeDeep({ ...original, ...input, points: -original.points, reversalOf: original.id });
}

/** Reversed contributions are removed before calculating score attainment times. */
export function computeEventScores(
  eventId: string,
  entries: readonly EventPointEntry[],
): readonly Readonly<RankedParticipant>[] {
  requireIdentifier(eventId, "event id");
  const origins = new Map<string, EventPointEntry>();
  const ids = new Set<string>();
  const reversed = new Set<string>();
  const activityAwards = new Set<string>();
  for (const entry of entries) {
    requireIdentifier(entry.id, "point entry id");
    requireIdentifier(entry.activityId, "point origin activity");
    requireIdentifier(entry.userId, "point participant");
    isoInstant(entry.occurredAt, "point timestamp");
    if (entry.eventId !== eventId) throw new EconomicError("EVENT_SCOPE_MISMATCH");
    if (ids.has(entry.id)) throw new EconomicError("DUPLICATE_POINT_ENTRY");
    ids.add(entry.id);
    if (!Number.isSafeInteger(entry.points) || entry.points === 0)
      throw new EconomicError("INVALID_EVENT_POINTS");
    if (!entry.reversalOf) {
      if (entry.points < 0) throw new EconomicError("NEGATIVE_POINT_ORIGIN");
      const activityKey = JSON.stringify([entry.activityId, entry.userId]);
      if (activityAwards.has(activityKey)) throw new EconomicError("DUPLICATE_ACTIVITY_POINTS");
      activityAwards.add(activityKey);
      origins.set(entry.id, entry);
    }
  }
  for (const entry of entries.filter((item) => item.reversalOf)) {
    const original = origins.get(entry.reversalOf!);
    if (
      !original ||
      original.userId !== entry.userId ||
      original.activityId !== entry.activityId ||
      original.points !== -entry.points ||
      entry.occurredAt < original.occurredAt
    )
      throw new EconomicError("INVALID_POINT_REVERSAL");
    if (reversed.has(original.id)) throw new EconomicError("DUPLICATE_POINT_REVERSAL");
    reversed.add(original.id);
  }
  const totals = new Map<string, EventScore>();
  for (const original of origins.values()) {
    if (reversed.has(original.id)) continue;
    const previous = totals.get(original.userId);
    const points = (previous?.points ?? 0) + original.points;
    requireSafeCount(points, "total event points");
    totals.set(original.userId, {
      userId: original.userId,
      points,
      achievedAt:
        previous && previous.achievedAt > original.occurredAt
          ? previous.achievedAt
          : original.occurredAt,
    });
  }
  return rankEventParticipants([...totals.values()]);
}
