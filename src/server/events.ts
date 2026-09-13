import type { User } from "@prisma/client";
import { rankEventParticipants } from "../domains/economy/events";
import { atomic, db } from "./db";
import { assert } from "./errors";
import { assertEligible } from "./profiles";
export async function listEvents() {
  return {
    events: await db.event.findMany({
      where: { state: { in: ["ACTIVE", "UPCOMING", "COMPLETED"] } },
      include: { _count: { select: { memberships: true } } },
      orderBy: { startAt: "desc" },
      take: 30,
    }),
  };
}
export async function getEvent(slug: string, user?: User | null) {
  const event = await db.event.findUnique({
    where: { slug },
    include: {
      campaigns: {
        where: { state: "ACTIVE" },
        select: { id: true, name: true, objective: true, destinationUrl: true, isDemo: true },
      },
      memberships: {
        include: { user: { select: { id: true, handle: true, displayName: true, isDemo: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  assert(event, "EVENT_NOT_FOUND", "Event not found.", 404);
  const aggregates = await db.eventPoint.groupBy({
    by: ["userId"],
    where: { eventId: event.id, reversal: false, activity: { state: "VALIDATED" } },
    _sum: { amount: true },
    _max: { createdAt: true },
  });
  const scores = event.memberships.map((member) => {
    const score = aggregates.find((item) => item.userId === member.userId);
    return {
      userId: member.userId,
      points: score?._sum.amount ?? 0,
      achievedAt: (score?._max.createdAt ?? member.joinedAt).toISOString(),
    };
  });
  const leaderboard = rankEventParticipants(scores).map((score) => ({
    ...score,
    ...event.memberships.find((member) => member.userId === score.userId)!.user,
  }));
  const { memberships, ...safeEvent } = event;
  return {
    event: { ...safeEvent, participantCount: memberships.length },
    leaderboard: leaderboard.slice(0, 100),
    joined: Boolean(user && memberships.some((member) => member.userId === user.id)),
    personal: user ? (leaderboard.find((row) => row.userId === user.id) ?? null) : null,
  };
}
export async function joinEvent(user: User, eventId: string) {
  return atomic(async (tx) => {
    await assertEligible(tx, user.id);
    const event = await tx.event.findUnique({ where: { id: eventId } });
    const now = new Date();
    assert(
      event && event.state === "ACTIVE" && event.startAt <= now && event.endAt > now,
      "EVENT_INACTIVE",
      "This event is not accepting participants.",
      409,
    );
    const membership = await tx.eventMembership.upsert({
      where: { eventId_userId: { eventId, userId: user.id } },
      create: { eventId, userId: user.id },
      update: {},
    });
    return { membership };
  });
}
