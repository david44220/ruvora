import { isDevelopment } from "./environment";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type User, type Event, type ActivityType } from "@prisma/client";
import { rankEventParticipants } from "../domains/economy/events";
import { eventConfigurationSchema } from "../domains/economy/event-settlement";
import { canonicalPayload } from "../domains/economy/shared";
import { evaluatePersistedPolicy } from "../domains/policy";
import { atomic, db, jsonValue, type Tx } from "./db";
import { assert } from "./errors";
import { assertEligible } from "./profiles";
import { requireRole } from "./auth";
import { activeRules, minor } from "./rules";
import { account, balance, postLedger } from "./ledger";
import { recordEventJoin, type AttributionTokens } from "./attribution";
const keySchema = z.string().regex(/^[a-zA-Z0-9:_-]{8,100}$/);
const reasonSchema = z.string().trim().min(10).max(500);
const hash = (input: unknown) => createHash("sha256").update(canonicalPayload(input)).digest("hex");
const contentSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(3000),
    rules: z.string().trim().min(10).max(5000),
  })
  .strict();
export const createEventSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .min(3)
      .max(100),
    localizedContent: z.object({ en: contentSchema, fr: contentSchema }).strict(),
    configuration: eventConfigurationSchema,
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    prizeBudgetMinor: minor,
    visibility: z.enum(["PUBLIC", "UNLISTED"]).default("PUBLIC"),
    sponsor: z.string().trim().min(1).max(120).optional(),
    idempotencyKey: keySchema,
  })
  .strict();
export async function lockEvent(tx: Tx, eventId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
  const event = await tx.event.findUnique({ where: { id: eventId } });
  assert(event, "EVENT_NOT_FOUND", "Event not found.", 404);
  assert(
    isDevelopment() || !event.isDemo,
    "DEMO_PRODUCTION_BLOCKED",
    "Development events cannot perform production economic operations.",
    403,
  );
  return event;
}
export async function independentEventAdmin(tx: Tx, actorId: string, event: Event) {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  assert(
    actor && !actor.suspended && !actor.economicHold,
    "FORBIDDEN",
    "An active independent administrator is required.",
    403,
  );
  requireRole(actor, "ADMIN");
  assert(
    ![event.ownerId, event.sponsorId, event.hostId].includes(actorId),
    "REVIEW_CONFLICT",
    "Event owners, sponsors and hosts cannot review their own event.",
    403,
  );
  return actor;
}
export function frozenEventConfiguration(event: Event) {
  return {
    eventId: event.id,
    configVersion: event.configVersion,
    configuration: event.configuration,
    localizedContent: event.localizedContent,
    title: event.title,
    description: event.description,
    artwork: event.artwork,
    sponsor: event.sponsor,
    ownerId: event.ownerId,
    sponsorId: event.sponsorId,
    hostId: event.hostId,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    prizeBudgetMinor: event.prizeBudgetMinor.toString(),
    visibility: event.visibility,
  };
}
export function assertApprovedEvent(event: Event) {
  assert(
    event.reviewedAt &&
      event.approvedSnapshot &&
      canonicalPayload(frozenEventConfiguration(event)) ===
        canonicalPayload(event.approvedSnapshot),
    "EVENT_RULES_CHANGED",
    "An unchanged independently approved event configuration is required.",
    409,
  );
}
async function priorOperation(
  tx: Tx,
  actorId: string,
  eventId: string | undefined,
  key: string,
  kind: string,
  payload: unknown,
) {
  const prior = await tx.eventOperation.findUnique({ where: { idempotencyKey: key } });
  if (prior)
    assert(
      prior.actorId === actorId &&
        (!eventId || prior.eventId === eventId) &&
        prior.kind === kind &&
        prior.payloadHash === hash(payload),
      "IDEMPOTENCY_CONFLICT",
      "This operation key was used with a different request.",
      409,
    );
  return prior;
}
async function recordOperation(
  tx: Tx,
  actorId: string,
  eventId: string,
  key: string,
  kind: string,
  payload: unknown,
  result: unknown,
) {
  await tx.eventOperation.create({
    data: {
      actorId,
      eventId,
      idempotencyKey: key,
      kind,
      payloadHash: hash(payload),
      result: jsonValue(result),
    },
  });
}
async function audit(tx: Tx, actorId: string, eventId: string, action: string, details: unknown) {
  await tx.auditLog.create({
    data: { actorId, targetId: eventId, action, details: jsonValue(details) },
  });
}
async function eventOwner(tx: Tx, actor: User, event: Event) {
  const fresh = await tx.user.findUnique({ where: { id: actor.id } });
  assert(
    fresh && !fresh.suspended && !fresh.economicHold,
    "FORBIDDEN",
    "An active event owner is required.",
    403,
  );
  assert(
    event.ownerId === actor.id || fresh.roles.includes("ADMIN"),
    "EVENT_NOT_FOUND",
    "Event not found.",
    404,
  );
  if (event.ownerId !== actor.id) await independentEventAdmin(tx, actor.id, event);
  return fresh;
}
async function linkedMedia(tx: Tx, event: Event) {
  const campaigns = await tx.campaign.findMany({ where: { eventId: event.id } });
  assert(
    event.prizeBudgetMinor === 0n || campaigns.length > 0,
    "EVENT_MEDIA_REQUIRED",
    "A sponsored event needs reviewed linked campaign media.",
    409,
  );
  for (const campaign of campaigns) {
    const independentReview = await tx.auditLog.findFirst({
      where: {
        targetId: campaign.id,
        action: "CAMPAIGN_REVIEWED",
        actorId: {
          notIn: [event.ownerId, event.sponsorId, event.hostId].filter((id): id is string =>
            Boolean(id),
          ),
        },
        details: { path: ["decision"], equals: "APPROVE" },
      },
      orderBy: { createdAt: "desc" },
    });
    assert(
      independentReview,
      "EVENT_MEDIA_UNREVIEWED",
      "Linked media requires recorded independent approval even when general campaign auto-approval is enabled.",
      409,
    );
    assert(
      [event.ownerId, event.sponsorId].includes(campaign.advertiserId),
      "EVENT_MEDIA_OWNER",
      "Linked campaigns must belong to the event sponsor.",
      409,
    );
    assert(
      ["ACTIVE", "PAUSED", "COMPLETED"].includes(campaign.state),
      "EVENT_MEDIA_UNREVIEWED",
      "Every linked campaign must pass independent media review.",
      409,
    );
    assert(
      campaign.startAt >= event.startAt && campaign.endAt <= event.endAt,
      "EVENT_MEDIA_WINDOW",
      "Linked media must remain inside the approved event window.",
      409,
    );
  }
}
// A concurrent create may collide on slug before its EventOperation becomes
// visible to the serializable snapshot. Retry only when this exact command key
// now exists; unrelated uniqueness failures must remain errors.
async function createCommand<T>(key: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await atomic(work);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (await db.eventOperation.findUnique({ where: { idempotencyKey: key } }))
    )
      return atomic(work);
    throw error;
  }
}
export async function createEvent(actor: User, input: unknown) {
  const value = createEventSchema.parse(input);
  const startAt = new Date(value.startAt),
    endAt = new Date(value.endAt);
  assert(
    startAt < endAt && endAt > new Date(),
    "INVALID_WINDOW",
    "Event end must follow its start and be in the future.",
  );
  return createCommand(value.idempotencyKey, async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: actor.id } });
    assert(
      fresh && !fresh.suspended && !fresh.economicHold,
      "FORBIDDEN",
      "An eligible creator, advertiser or administrator is required.",
      403,
    );
    assert(
      fresh.roles.some((r) => ["ADVERTISER", "CREATOR", "ADMIN"].includes(r)),
      "FORBIDDEN",
      "Only creators, advertisers and administrators can create events.",
      403,
    );
    const { config } = await activeRules(tx);
    if (!fresh.roles.includes("ADMIN")) {
      await assertEligible(tx, actor.id);
      if (!fresh.roles.includes("ADVERTISER"))
        assert(
          evaluatePersistedPolicy(fresh, "CREATOR_MONETIZATION", config).eligible,
          "CREATOR_INELIGIBLE",
          "Creator eligibility is required to host an event.",
          403,
        );
    }
    assert(
      value.configuration.allowedCountries.every((country) =>
        config.allowedCountries.includes(country),
      ),
      "EVENT_COUNTRY_POLICY",
      "Event countries must be allowed by platform policy.",
    );
    assert(
      value.prizeBudgetMinor === 0n || fresh.roles.includes("ADVERTISER"),
      "EVENT_SPONSOR_REQUIRED",
      "A prize budget requires an advertiser sponsor.",
      403,
    );
    assert(
      value.prizeBudgetMinor === 0n || value.configuration.rewardTiers.length > 0,
      "EVENT_PRIZE_RULES_REQUIRED",
      "A prize budget requires disclosed reward tiers.",
    );
    const prior = await priorOperation(
      tx,
      actor.id,
      undefined,
      value.idempotencyKey,
      "CREATE",
      value,
    );
    if (prior) return { event: await tx.event.findUniqueOrThrow({ where: { id: prior.eventId } }) };
    const event = await tx.event.create({
      data: {
        id: randomUUID(),
        slug: value.slug,
        title: value.localizedContent.en.title,
        description: value.localizedContent.en.description,
        localizedContent: jsonValue(value.localizedContent),
        rules: jsonValue(value.localizedContent),
        configuration: jsonValue(value.configuration),
        configVersion: value.configuration.version,
        startAt,
        endAt,
        prizeBudgetMinor: value.prizeBudgetMinor,
        visibility: value.visibility,
        sponsor: value.sponsor,
        ownerId: actor.id,
        sponsorId: fresh.roles.includes("ADVERTISER") ? actor.id : null,
        hostId: fresh.roles.includes("CREATOR") ? actor.id : null,
        state: "DRAFT",
        isDemo: isDevelopment(),
        fundingState: value.prizeBudgetMinor === 0n ? "FUNDED" : "UNFUNDED",
      },
    });
    await recordOperation(tx, actor.id, event.id, value.idempotencyKey, "CREATE", value, {
      eventId: event.id,
    });
    await audit(tx, actor.id, event.id, "EVENT_CREATED", {
      configuration: value.configuration,
      prizeBudgetMinor: value.prizeBudgetMinor,
    });
    return { event };
  });
}
export async function reviewEvent(admin: User, eventId: string, input: unknown) {
  const value = z
    .object({ decision: z.enum(["APPROVE", "REJECT"]), reason: reasonSchema })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const event = await lockEvent(tx, eventId);
    await independentEventAdmin(tx, admin.id, event);
    assert(
      event.state === "PENDING_REVIEW",
      "EVENT_REVIEW_STATE",
      "Only a submitted event can be reviewed.",
      409,
    );
    if (value.decision === "APPROVE") {
      eventConfigurationSchema.parse(event.configuration);
      await linkedMedia(tx, event);
    }
    const reviewed = await tx.event.update({
      where: { id: event.id },
      data: {
        state: value.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewReason: value.reason,
        ...(value.decision === "APPROVE"
          ? { approvedSnapshot: jsonValue(frozenEventConfiguration(event)) }
          : {}),
      },
    });
    await audit(tx, admin.id, eventId, `EVENT_${value.decision}D`, value);
    return { event: reviewed };
  });
}
export async function fundEventPrize(actor: User, eventId: string, input: unknown) {
  const value = z
    .object({ amountMinor: minor.refine((v) => v > 0n), idempotencyKey: keySchema })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const event = await lockEvent(tx, eventId);
    const fresh = await assertEligible(tx, actor.id);
    requireRole(fresh, "ADVERTISER");
    assert(event.sponsorId === actor.id, "EVENT_NOT_FOUND", "Sponsored event not found.", 404);
    const prior = await priorOperation(tx, actor.id, eventId, value.idempotencyKey, "FUND", value);
    if (prior) return { event, fundedMinor: await balance(tx, `event:${eventId}:prize`) };
    assert(
      ["DRAFT", "PENDING_REVIEW", "APPROVED"].includes(event.state),
      "EVENT_FUNDING_CLOSED",
      "This event no longer accepts prize funding.",
      409,
    );
    const funded = await balance(tx, `event:${eventId}:prize`);
    assert(
      funded + value.amountMinor <= event.prizeBudgetMinor,
      "EVENT_PRIZE_BUDGET_EXCEEDED",
      "Funding cannot exceed the disclosed prize budget.",
      409,
    );
    await account(tx, `advertiser:${actor.id}`, "ADVERTISER_AVAILABLE", { userId: actor.id });
    await account(tx, `event:${eventId}:prize`, "EVENT_PRIZE", { eventId });
    const ledger = await postLedger(tx, {
      key: `event-fund:${value.idempotencyKey}`,
      kind: "EVENT_PRIZE_FUNDING",
      referenceId: eventId,
      description: "Reserve advertiser available funds for the disclosed event prize pool",
      isDemo: event.isDemo,
      entries: [
        { accountId: `advertiser:${actor.id}`, amountMinor: -value.amountMinor },
        { accountId: `event:${eventId}:prize`, amountMinor: value.amountMinor },
      ],
    });
    const updated = await tx.event.update({
      where: { id: eventId },
      data: {
        fundingState: funded + value.amountMinor === event.prizeBudgetMinor ? "FUNDED" : "PARTIAL",
      },
    });
    await recordOperation(tx, actor.id, eventId, value.idempotencyKey, "FUND", value, {
      ledgerId: ledger.id,
    });
    await audit(tx, actor.id, eventId, "EVENT_PRIZE_FUNDED", { ...value, ledgerId: ledger.id });
    return { event: updated, fundedMinor: funded + value.amountMinor };
  });
}
export async function transitionEvent(actor: User, eventId: string, input: unknown) {
  const value = z
    .object({
      action: z.enum(["SUBMIT", "ACTIVATE", "PAUSE", "COMPLETE", "CANCEL"]),
      reason: reasonSchema,
      idempotencyKey: keySchema,
    })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const event = await lockEvent(tx, eventId);
    await eventOwner(tx, actor, event);
    const prior = await priorOperation(
      tx,
      actor.id,
      eventId,
      value.idempotencyKey,
      value.action,
      value,
    );
    if (prior) return { event };
    assert(
      !["SETTLED", "CANCELLED"].includes(event.state),
      "EVENT_FINALIZED",
      "A settled or cancelled event cannot change.",
      409,
    );
    let state = event.state;
    if (value.action === "SUBMIT") {
      assert(state === "DRAFT", "EVENT_STATE", "Only drafts can be submitted.", 409);
      state = "PENDING_REVIEW";
    }
    if (value.action === "ACTIVATE") {
      assert(
        ["APPROVED", "PAUSED"].includes(state),
        "EVENT_STATE",
        "Activation requires an approved or paused event.",
        409,
      );
      assertApprovedEvent(event);
      await linkedMedia(tx, event);
      assert(event.endAt > new Date(), "EVENT_ENDED", "An ended event cannot be activated.", 409);
      assert(
        (await balance(tx, `event:${eventId}:prize`)) >= event.prizeBudgetMinor,
        "EVENT_UNDERFUNDED",
        "The full disclosed prize pool must be funded before activation.",
        409,
      );
      state = "ACTIVE";
    }
    if (value.action === "PAUSE") {
      assert(state === "ACTIVE", "EVENT_STATE", "Only active events can be paused.", 409);
      state = "PAUSED";
    }
    if (value.action === "COMPLETE") {
      assert(
        ["ACTIVE", "PAUSED"].includes(state) && event.endAt <= new Date(),
        "EVENT_NOT_ENDED",
        "Complete the event after its approved end time.",
        409,
      );
      state = "COMPLETED";
    }
    if (value.action === "CANCEL") {
      assert(
        state !== "SETTLING",
        "EVENT_SETTLEMENT_FROZEN",
        "Settlement is frozen; cancellation cannot race payouts.",
        409,
      );
      // Once approved participation has occurred, a sponsor cannot unilaterally remove earned prize opportunity.
      if (["ACTIVE", "PAUSED", "COMPLETED"].includes(state)) {
        await independentEventAdmin(tx, actor.id, event);
        assert(
          (await tx.activity.count({
            where: { eventId, state: { in: ["PENDING_VALIDATION", "VALIDATED"] } },
          })) === 0,
          "EVENT_HAS_ACTIVITY",
          "Review existing participation through settlement before releasing its prize pool.",
          409,
        );
      }
      const funded = await balance(tx, `event:${eventId}:prize`);
      if (funded > 0n) {
        assert(
          event.sponsorId,
          "EVENT_SPONSOR_REQUIRED",
          "A prize refund requires its original sponsor.",
          409,
        );
        await account(tx, `advertiser:${event.sponsorId}`, "ADVERTISER_AVAILABLE", {
          userId: event.sponsorId,
        });
        await postLedger(tx, {
          key: `event-cancel:${value.idempotencyKey}`,
          kind: "EVENT_PRIZE_REFUND",
          referenceId: eventId,
          description: "Return all unused event prize funds to the original sponsor",
          isDemo: event.isDemo,
          entries: [
            { accountId: `event:${eventId}:prize`, amountMinor: -funded },
            { accountId: `advertiser:${event.sponsorId}`, amountMinor: funded },
          ],
        });
      }
      state = "CANCELLED";
    }
    const updated = await tx.event.update({
      where: { id: eventId },
      data: {
        state,
        ...(state === "CANCELLED" ? { cancelledAt: new Date(), fundingState: "REFUNDED" } : {}),
        ...(state === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });
    await recordOperation(tx, actor.id, eventId, value.idempotencyKey, value.action, value, {
      state,
    });
    await audit(tx, actor.id, eventId, `EVENT_${value.action}`, value);
    return { event: updated };
  });
}
export async function assertEventActivityEligible(
  tx: Tx,
  eventId: string,
  userId: string,
  occurredAt: Date,
  mode: "SUBMIT" | "VALIDATE" | "REVERSE",
  reviewerId?: string,
) {
  const event = await lockEvent(tx, eventId);
  assert(
    !["SETTLING", "SETTLED", "CANCELLED"].includes(event.state),
    "EVENT_SETTLEMENT_FROZEN",
    "Event points and activity are frozen for final settlement.",
    409,
  );
  if (reviewerId) await independentEventAdmin(tx, reviewerId, event);
  if (mode === "REVERSE") return event;
  assert(
    ["ACTIVE", "PAUSED", "COMPLETED"].includes(event.state) &&
      (mode !== "SUBMIT" || event.state === "ACTIVE"),
    "EVENT_INACTIVE",
    "This event is not accepting this activity.",
    409,
  );
  assert(
    occurredAt >= event.startAt &&
      occurredAt < event.endAt &&
      (mode !== "SUBMIT" || event.endAt > new Date()),
    "EVENT_ACTIVITY_WINDOW",
    "Activity must occur inside the event window.",
    409,
  );
  const user = await assertEligible(tx, userId);
  assert(
    ![event.ownerId, event.sponsorId, event.hostId].includes(userId),
    "SELF_PARTICIPATION",
    "Owners, sponsors and hosts cannot farm their own event rewards.",
    403,
  );
  const member = await tx.eventMembership.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  assert(member, "EVENT_NOT_JOINED", "Join the event before submitting activity.", 409);
  assert(
    !member.disqualified,
    "EVENT_DISQUALIFIED",
    "This participant is disqualified from the event.",
    403,
  );
  assert(
    member.joinedAt <= occurredAt,
    "EVENT_NOT_JOINED",
    "Activity cannot predate event membership.",
    409,
  );
  if (event.configVersion !== "legacy-event-v1") {
    assertApprovedEvent(event);
    const configuration = eventConfigurationSchema.parse(event.configuration);
    assert(
      user.country && configuration.allowedCountries.includes(user.country),
      "EVENT_COUNTRY_POLICY",
      "This event is unavailable in the participant region.",
      403,
    );
  }
  return event;
}
export async function eventPointsAward(
  tx: Tx,
  eventId: string,
  userId: string,
  type: ActivityType,
  occurredAt: Date,
  fallbackAmount: number,
) {
  const event = await lockEvent(tx, eventId);
  assert(
    !["SETTLING", "SETTLED", "CANCELLED"].includes(event.state),
    "EVENT_SETTLEMENT_FROZEN",
    "Event point awards are frozen.",
    409,
  );
  if (event.configVersion === "legacy-event-v1") return fallbackAmount;
  const config = eventConfigurationSchema.parse(event.configuration);
  const day = new Date(occurredAt);
  day.setUTCHours(0, 0, 0, 0);
  const end = new Date(day.getTime() + 86400000);
  const used =
    (
      await tx.eventPoint.aggregate({
        where: {
          eventId,
          userId,
          reversal: false,
          activity: { state: "VALIDATED", createdAt: { gte: day, lt: end } },
        },
        _sum: { amount: true },
      })
    )._sum.amount ?? 0;
  return Math.max(0, Math.min(config.pointRules[type], config.maxPointsPerUserPerDay - used));
}
export async function disqualifyEventParticipant(admin: User, eventId: string, input: unknown) {
  const value = z
    .object({ userId: z.string().min(1).max(100), reason: reasonSchema })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const event = await lockEvent(tx, eventId);
    await independentEventAdmin(tx, admin.id, event);
    assert(
      admin.id !== value.userId,
      "REVIEW_CONFLICT",
      "Administrators cannot review their own participation.",
      403,
    );
    assert(
      !["SETTLED", "CANCELLED"].includes(event.state),
      "EVENT_FINALIZED",
      "Finalized event eligibility is immutable.",
      409,
    );
    const member = await tx.eventMembership.findUnique({
      where: { eventId_userId: { eventId, userId: value.userId } },
    });
    assert(member, "EVENT_NOT_JOINED", "Participant not found.", 404);
    if (member.disqualified) {
      assert(
        member.disqualificationReason === value.reason,
        "IDEMPOTENCY_CONFLICT",
        "This participant was disqualified with another reason.",
        409,
      );
      return { membership: member };
    }
    const membership = await tx.eventMembership.update({
      where: { id: member.id },
      data: {
        disqualified: true,
        disqualificationReason: value.reason,
        disqualifiedById: admin.id,
        disqualifiedAt: new Date(),
      },
    });
    await audit(tx, admin.id, eventId, "EVENT_PARTICIPANT_DISQUALIFIED", value);
    return { membership };
  });
}
export async function joinEvent(user: User, eventId: string, tokens?: AttributionTokens) {
  return atomic(async (tx) => {
    const event = await lockEvent(tx, eventId);
    const fresh = await assertEligible(tx, user.id);
    const now = new Date();
    assert(
      event.state === "ACTIVE" && event.startAt <= now && event.endAt > now,
      "EVENT_INACTIVE",
      "This event is not accepting participants.",
      409,
    );
    assert(
      ![event.ownerId, event.sponsorId, event.hostId].includes(user.id),
      "SELF_PARTICIPATION",
      "Owners, sponsors and hosts cannot enter their own event.",
      403,
    );
    const prior = await tx.eventMembership.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
    });
    assert(
      !prior?.disqualified,
      "EVENT_DISQUALIFIED",
      "This participant is disqualified from the event.",
      403,
    );
    if (event.configVersion !== "legacy-event-v1") {
      assertApprovedEvent(event);
      const config = eventConfigurationSchema.parse(event.configuration);
      assert(
        fresh.country && config.allowedCountries.includes(fresh.country),
        "EVENT_COUNTRY_POLICY",
        "This event is unavailable in your region.",
        403,
      );
      if (!prior)
        assert(
          (await tx.eventMembership.count({ where: { eventId } })) < config.participantCap,
          "EVENT_CAPACITY",
          "This event has reached its participant cap.",
          409,
        );
    }
    const membership =
      prior ?? (await tx.eventMembership.create({ data: { eventId, userId: user.id } }));
    await recordEventJoin(tx, user.id, eventId, tokens);
    return { membership };
  });
}
const publicStates = [
  "ACTIVE",
  "SCHEDULED",
  "UPCOMING",
  "PAUSED",
  "COMPLETED",
  "SETTLING",
  "SETTLED",
];
export function publicEvent(event: Event) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    artwork: event.artwork,
    sponsor: event.sponsor,
    startAt: event.startAt,
    endAt: event.endAt,
    rules: event.rules,
    localizedContent: event.localizedContent,
    configuration: event.configuration,
    configVersion: event.configVersion,
    prizeBudgetMinor: event.prizeBudgetMinor,
    fundingState: event.fundingState,
    state: event.state,
    isDemo: event.isDemo,
    visibility: event.visibility,
  };
}
export async function listEvents() {
  const events = await db.event.findMany({
    where: {
      state: { in: publicStates },
      visibility: "PUBLIC",
      ...(!isDevelopment() ? { isDemo: false } : {}),
    },
    include: { _count: { select: { memberships: true } } },
    orderBy: { startAt: "desc" },
    take: 30,
  });
  return { events: events.map((event) => ({ ...publicEvent(event), _count: event._count })) };
}
export async function listManagedEvents(actor: User) {
  const fresh = await db.user.findUnique({ where: { id: actor.id } });
  assert(fresh && !fresh.suspended, "FORBIDDEN", "An active account is required.", 403);
  const events = await db.event.findMany({
    where: { ...(fresh.roles.includes("ADMIN") ? {} : { ownerId: actor.id }) },
    include: {
      _count: { select: { memberships: true } },
      settlements: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    events: await Promise.all(
      events.map(async (event) => ({
        ...event,
        fundedMinor: await balance(db, `event:${event.id}:prize`),
      })),
    ),
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
      settlements: { where: { state: "FINALIZED" }, take: 1 },
    },
  });
  assert(
    event &&
      (publicStates.includes(event.state) ||
        user?.id === event.ownerId ||
        user?.roles.includes("ADMIN")) &&
      (isDevelopment() || !event.isDemo),
    "EVENT_NOT_FOUND",
    "Event not found.",
    404,
  );
  const aggregates = await db.eventPoint.groupBy({
    by: ["userId"],
    where: { eventId: event.id, reversal: false, activity: { state: "VALIDATED" } },
    _sum: { amount: true },
    _max: { createdAt: true },
  });
  let ranking = rankEventParticipants(
    event.memberships
      .filter((member) => !member.disqualified)
      .map((member) => {
        const score = aggregates.find((item) => item.userId === member.userId);
        return {
          userId: member.userId,
          points: score?._sum.amount ?? 0,
          achievedAt: (score?._max.createdAt ?? member.joinedAt).toISOString(),
        };
      }),
  );
  const final = event.settlements[0];
  if (final) {
    const snapshot = final.snapshot as { preview?: { ranking?: typeof ranking } };
    assert(
      Array.isArray(snapshot.preview?.ranking),
      "EVENT_SNAPSHOT_INVALID",
      "The immutable event ranking is unavailable.",
      503,
    );
    ranking = snapshot.preview.ranking;
  }
  const leaderboard = ranking.map((score) => ({
    ...score,
    ...event.memberships.find((member) => member.userId === score.userId)!.user,
  }));
  return {
    event: {
      ...publicEvent(event),
      campaigns: event.campaigns,
      participantCount: event.memberships.length,
      fundedMinor: await balance(db, `event:${event.id}:prize`),
      settlement: final
        ? {
            id: final.id,
            state: final.state,
            finalizedAt: final.finalizedAt,
            fingerprint: final.fingerprint,
          }
        : null,
    },
    leaderboard: leaderboard.slice(0, 100),
    joined: Boolean(user && event.memberships.some((member) => member.userId === user.id)),
    personal: user ? (leaderboard.find((row) => row.userId === user.id) ?? null) : null,
    personalPrizeMinor:
      user && final
        ? ((
            final.snapshot as {
              preview: { allocations: { userId: string; amountMinor: string }[] };
            }
          ).preview.allocations.find((row) => row.userId === user.id)?.amountMinor ?? "0")
        : null,
  };
}
