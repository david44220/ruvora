import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { AttributionContext, Campaign, User } from "@prisma/client";
import { assertAttributionUse } from "../domains/economy/attribution";
import { evaluatePersistedPolicy } from "../domains/policy";
import { atomic, db, jsonValue, type Tx } from "./db";
import { assert, AppError } from "./errors";
import { activeRules, attributionPolicySchema, referralPolicySchema } from "./rules";
import { establishDirectReferral } from "./referrals";
import { canCreatorPromote } from "./campaign-eligibility";
import { balance } from "./ledger";
import { isDevelopment } from "./environment";

export interface AttributionTokens {
  attributionToken?: string;
  visitorToken?: string;
}
export const ATTRIBUTION_COOKIE = !isDevelopment()
  ? "__Host-ruvora_attribution"
  : "ruvora_attribution";
export const VISITOR_COOKIE = !isDevelopment() ? "__Host-ruvora_visitor" : "ruvora_visitor";
export const attributionTokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const publicSlug = z.string().regex(/^[A-Za-z0-9_-]{24}$/);

async function eligibleCreator(tx: Tx, id: string, campaign?: Campaign) {
  const creator = await tx.user.findUnique({ where: { id } });
  const { config } = await activeRules(tx);
  assert(
    creator &&
      evaluatePersistedPolicy(creator, "CREATOR_MONETIZATION", config).eligible &&
      (isDevelopment() || !creator.isDemo),
    "CREATOR_INELIGIBLE",
    "The creator is not eligible for attribution.",
    403,
  );
  if (campaign) {
    assert(
      creator.id !== campaign.advertiserId,
      "SELF_ATTRIBUTION",
      "An advertiser cannot claim creator credit for their campaign.",
      403,
    );
    assert(
      canCreatorPromote(creator, campaign),
      "CREATOR_CAMPAIGN_INELIGIBLE",
      "The creator is outside this campaign's eligibility policy.",
      403,
    );
  }
  return creator;
}
async function ensureEntry(
  tx: Tx,
  value: {
    ownerId: string;
    creatorId?: string;
    referrerId?: string;
    campaignId?: string;
    eventId?: string;
    source: "CREATOR_PROFILE" | "CREATOR_LINK" | "REFERRAL" | "EVENT" | "CAMPAIGN" | "SHARE_LINK";
    isDemo: boolean;
  },
) {
  assert(
    isDevelopment() || !value.isDemo,
    "DEMO_PRODUCTION_BLOCKED",
    "Development share links are unavailable outside development.",
    403,
  );
  const canonicalKey = [
    value.source,
    value.ownerId,
    value.creatorId ?? "",
    value.referrerId ?? "",
    value.campaignId ?? "",
    value.eventId ?? "",
  ].join(":");
  // Public profile/metadata reads reuse the immutable origin without an upsert.
  // Concurrent first publishers converge on the canonical key; serializable
  // conflicts retry the whole eligibility check before reading the winner.
  let entry = await tx.shareLink.findUnique({ where: { canonicalKey } });
  if (!entry) {
    await tx.shareLink.createMany({
      data: { ...value, canonicalKey, slug: randomBytes(18).toString("base64url") },
      skipDuplicates: true,
    });
    entry = await tx.shareLink.findUniqueOrThrow({ where: { canonicalKey } });
  }
  assert(entry.active, "SHARE_LINK_INACTIVE", "This share link is unavailable.", 404);
  return { slug: entry.slug, url: `/go/${entry.slug}` };
}
export async function getProfileEntry(handle: string) {
  return atomic(async (tx) => {
    const creator = await tx.user.findUnique({ where: { handle } });
    assert(creator, "PROFILE_NOT_FOUND", "Profile not found.", 404);
    await eligibleCreator(tx, creator.id);
    return ensureEntry(tx, {
      ownerId: creator.id,
      creatorId: creator.id,
      source: "CREATOR_PROFILE",
      isDemo: creator.isDemo,
    });
  });
}
export async function getCreatorCampaignEntry(handle: string, campaignId: string) {
  return atomic(async (tx) => {
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    const creator = await tx.user.findUnique({ where: { handle } });
    const now = new Date();
    assert(
      campaign && campaign.state === "ACTIVE" && campaign.startAt <= now && campaign.endAt > now,
      "CAMPAIGN_INACTIVE",
      "This campaign is not available.",
      409,
    );
    assert(creator, "PROFILE_NOT_FOUND", "Profile not found.", 404);
    await eligibleCreator(tx, creator.id, campaign);
    await availableCampaign(tx, campaign);
    return ensureEntry(tx, {
      ownerId: creator.id,
      creatorId: creator.id,
      campaignId,
      eventId: campaign.eventId ?? undefined,
      source: "CREATOR_LINK",
      isDemo: creator.isDemo || campaign.isDemo,
    });
  });
}
export async function getCreatorEventEntry(handle: string, eventId: string) {
  return atomic(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    const creator = await tx.user.findUnique({ where: { handle } });
    assert(
      event && ["ACTIVE", "SCHEDULED"].includes(event.state),
      "EVENT_INACTIVE",
      "This event is not available.",
      409,
    );
    assert(creator, "PROFILE_NOT_FOUND", "Profile not found.", 404);
    await eligibleCreator(tx, creator.id);
    return ensureEntry(tx, {
      ownerId: creator.id,
      creatorId: creator.id,
      eventId,
      source: "CREATOR_LINK",
      isDemo: creator.isDemo || event.isDemo,
    });
  });
}
export async function createShareLink(user: User, input: unknown) {
  const value = z
    .object({
      surface: z.enum(["PROFILE", "EVENT", "CAMPAIGN", "REFERRAL"]),
      targetId: z.string().min(1).max(100).optional(),
    })
    .strict()
    .parse(input);
  if (value.surface === "PROFILE") {
    assert(
      !value.targetId || value.targetId === user.id,
      "FORBIDDEN",
      "Profile share must belong to your account.",
      403,
    );
    assert(user.handle, "PROFILE_NOT_FOUND", "Create a public profile first.");
    return getProfileEntry(user.handle);
  }
  return atomic(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const { config } = await activeRules(tx);
    assert(
      evaluatePersistedPolicy(actor, "PARTICIPATION", config).eligible &&
        (isDevelopment() || !actor.isDemo),
      "POLICY_INELIGIBLE",
      "This account cannot publish share links.",
      403,
    );
    const creatorId = evaluatePersistedPolicy(actor, "CREATOR_MONETIZATION", config).eligible
      ? actor.id
      : undefined;
    if (value.surface === "REFERRAL")
      return ensureEntry(tx, {
        ownerId: actor.id,
        creatorId,
        referrerId: actor.id,
        source: "REFERRAL",
        isDemo: actor.isDemo,
      });
    assert(value.targetId, "TARGET_REQUIRED", "Choose a share destination.");
    if (value.surface === "EVENT") {
      const event = await tx.event.findUnique({ where: { id: value.targetId } });
      assert(
        event && ["ACTIVE", "SCHEDULED"].includes(event.state),
        "EVENT_INACTIVE",
        "This event is not available.",
        409,
      );
      const result = await ensureEntry(tx, {
        ownerId: actor.id,
        creatorId,
        eventId: event.id,
        source: "EVENT",
        isDemo: actor.isDemo || event.isDemo,
      });
      const share = await tx.shareLink.findUniqueOrThrow({ where: { slug: result.slug } });
      await recordGrowth(tx, {
        dedupeKey: `share-published:${share.id}`,
        type: "EVENT_SHARE",
        shareLinkId: share.id,
        creatorId,
        userId: actor.id,
        eventId: event.id,
        isDemo: share.isDemo,
      });
      return result;
    }
    const campaign = await tx.campaign.findUnique({ where: { id: value.targetId } });
    assert(
      campaign && campaign.state === "ACTIVE" && campaign.endAt > new Date(),
      "CAMPAIGN_INACTIVE",
      "This campaign is not available.",
      409,
    );
    await availableCampaign(tx, campaign);
    if (creatorId && creatorId !== campaign.advertiserId)
      await eligibleCreator(tx, creatorId, campaign);
    return ensureEntry(tx, {
      ownerId: actor.id,
      creatorId: creatorId === campaign.advertiserId ? undefined : creatorId,
      campaignId: campaign.id,
      eventId: campaign.eventId ?? undefined,
      source: "CAMPAIGN",
      isDemo: actor.isDemo || campaign.isDemo,
    });
  });
}
export async function recordGrowth(
  tx: Tx,
  data: {
    dedupeKey: string;
    type: string;
    attributionId?: string;
    shareLinkId?: string;
    creatorId?: string;
    userId?: string;
    campaignId?: string;
    eventId?: string;
    isDemo: boolean;
  },
) {
  return tx.growthEvent.upsert({ where: { dedupeKey: data.dedupeKey }, create: data, update: {} });
}
export async function loadAttribution(
  tx: Tx,
  tokens?: AttributionTokens,
  userId?: string,
  at = new Date(),
) {
  if (!tokens?.attributionToken && !tokens?.visitorToken) return null;
  assert(
    tokens.attributionToken &&
      tokens.visitorToken &&
      tokenPattern.test(tokens.attributionToken) &&
      tokenPattern.test(tokens.visitorToken),
    "ATTRIBUTION_TOKEN_INVALID",
    "The attribution context is invalid.",
    403,
  );
  const context = await tx.attributionContext.findUnique({
    where: { tokenHash: attributionTokenHash(tokens.attributionToken) },
  });
  assert(
    context && context.visitorHash === attributionTokenHash(tokens.visitorToken),
    "ATTRIBUTION_TOKEN_INVALID",
    "The attribution context is invalid.",
    403,
  );
  assert(
    context.status === "ACTIVE" && context.firstTouchAt <= at && context.expiresAt > at,
    "ATTRIBUTION_EXPIRED",
    "This attribution context has expired. Open the creator link again.",
    409,
  );
  assert(
    !context.boundUserId || context.boundUserId === userId,
    "ATTRIBUTION_ACCOUNT_MISMATCH",
    "This attribution context belongs to another account.",
    403,
  );
  assert(
    isDevelopment() || !context.isDemo,
    "DEMO_PRODUCTION_BLOCKED",
    "Development attribution cannot be used in production.",
    403,
  );
  return context;
}
async function bindContext(tx: Tx, context: AttributionContext, userId: string) {
  assert(
    !context.boundUserId || context.boundUserId === userId,
    "ATTRIBUTION_ACCOUNT_MISMATCH",
    "This attribution context belongs to another account.",
    403,
  );
  assert(
    context.creatorId !== userId && context.referrerId !== userId,
    "SELF_ATTRIBUTION",
    "An account cannot attribute its own activity to itself.",
    403,
  );
  if (context.boundUserId) return context;
  return tx.attributionContext.update({
    where: { id: context.id },
    data: { boundUserId: userId, boundAt: new Date() },
  });
}
export async function startAttribution(
  entrySlug: string,
  tokens?: AttributionTokens,
  user?: User | null,
) {
  const slug = publicSlug.parse(entrySlug);
  return atomic(async (tx) => {
    const entry = await tx.shareLink.findUnique({
      where: { slug },
      include: { campaign: true, event: true, creator: true, owner: true },
    });
    assert(
      entry &&
        entry.active &&
        !entry.owner.suspended &&
        !entry.owner.economicHold &&
        (isDevelopment() || !entry.owner.isDemo),
      "SHARE_LINK_INACTIVE",
      "This share link is unavailable.",
      404,
    );
    if (entry.creatorId) await eligibleCreator(tx, entry.creatorId, entry.campaign ?? undefined);
    if (entry.campaign) await availableCampaign(tx, entry.campaign);
    if (entry.event)
      assert(
        !["CANCELLED", "REJECTED", "DRAFT", "PENDING_REVIEW"].includes(entry.event.state) &&
          entry.event.visibility === "PUBLIC",
        "EVENT_INACTIVE",
        "This public event is unavailable.",
        404,
      );
    assert(
      isDevelopment() || !entry.isDemo,
      "DEMO_PRODUCTION_BLOCKED",
      "Development share links cannot generate production attribution.",
      403,
    );
    const { record, config } = await activeRules(tx);
    const now = new Date();
    let existing: AttributionContext | null = null;
    try {
      existing = await loadAttribution(tx, tokens, user?.id, now);
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        !["ATTRIBUTION_EXPIRED", "ATTRIBUTION_TOKEN_INVALID"].includes(error.code)
      )
        throw error;
    }
    // An explicit referral link from the already captured creator can add its direct relationship before signup.
    // Append a new provenance record; never overwrite the immutable creator origin or reset its clock.
    if (
      existing?.creatorId &&
      !existing.boundUserId &&
      !existing.referrerId &&
      entry.referrerId === existing.creatorId &&
      entry.creatorId === existing.creatorId
    ) {
      const previous = existing;
      const attributionToken = opaque();
      existing = await tx.attributionContext.create({
        data: {
          tokenHash: attributionTokenHash(attributionToken),
          visitorHash: previous.visitorHash,
          creatorId: previous.creatorId,
          referrerId: entry.referrerId,
          shareLinkId: previous.shareLinkId,
          campaignId: previous.campaignId,
          eventId: previous.eventId,
          source: previous.source,
          ruleVersion: previous.ruleVersion,
          policySnapshot: jsonValue({
            ...z.record(z.string(), z.json()).parse(previous.policySnapshot),
            creatorOriginContextId: previous.id,
            referralOriginShareLinkId: entry.id,
          }),
          firstTouchAt: previous.firstTouchAt,
          lastTouchAt: now,
          expiresAt: previous.expiresAt,
          isDemo: previous.isDemo || entry.isDemo,
        },
      });
      await tx.attributionContext.update({
        where: { id: previous.id },
        data: { status: "REVOKED" },
      });
      await tx.auditLog.create({
        data: {
          action: "ATTRIBUTION_DIRECT_REFERRAL_CAPTURED",
          targetId: existing.id,
          details: {
            creatorOriginContextId: previous.id,
            referralOriginShareLinkId: entry.id,
            source: previous.source,
          },
        },
      });
      tokens = { attributionToken, visitorToken: tokens!.visitorToken };
    }
    // The first eligible creator touch remains fixed, including its destination restrictions.
    if (existing && existing.creatorId) {
      await eligibleCreator(tx, existing.creatorId);
      if (user) existing = await bindContext(tx, existing, user.id);
      await tx.attributionContext.update({
        where: { id: existing.id },
        data: { lastTouchAt: now },
      });
      await recordGrowth(tx, {
        dedupeKey: `visit:${attributionSessionKey(existing)}:${entry.id}`,
        type: entry.source === "CREATOR_PROFILE" ? "PROFILE_VIEW" : "SHARE_VISIT",
        attributionId: existing.id,
        shareLinkId: entry.id,
        creatorId: entry.creatorId ?? undefined,
        userId: user?.id,
        campaignId: entry.campaignId ?? undefined,
        eventId: entry.eventId ?? undefined,
        isDemo: existing.isDemo || entry.isDemo,
      });
      await recordCampaignEntryStart(tx, existing, entry.campaignId, user?.id);
      return {
        attributionToken: tokens!.attributionToken!,
        visitorToken: tokens!.visitorToken!,
        expiresAt: existing.expiresAt,
        redirectTo: destination(entry),
        source: existing.source,
      };
    }
    const attributionToken = opaque(),
      visitorToken = existing && tokens?.visitorToken ? tokens.visitorToken : opaque();
    let context = await tx.attributionContext.create({
      data: {
        tokenHash: attributionTokenHash(attributionToken),
        visitorHash: attributionTokenHash(visitorToken),
        creatorId: entry.creatorId,
        referrerId: entry.referrerId,
        shareLinkId: entry.id,
        campaignId: entry.campaignId,
        eventId: entry.eventId,
        source: entry.source,
        ruleVersion: `${record.version}:${config.attribution.version}`,
        policySnapshot: jsonValue({ attribution: config.attribution, referral: config.referral }),
        firstTouchAt: now,
        lastTouchAt: now,
        expiresAt: new Date(now.getTime() + config.attribution.windowSeconds * 1000),
        isDemo: entry.isDemo,
      },
    });
    if (user) context = await bindContext(tx, context, user.id);
    await recordGrowth(tx, {
      dedupeKey: `session:${context.id}`,
      type: "ATTRIBUTED_SESSION",
      attributionId: context.id,
      shareLinkId: entry.id,
      creatorId: context.creatorId ?? undefined,
      userId: user?.id,
      campaignId: context.campaignId ?? undefined,
      eventId: context.eventId ?? undefined,
      isDemo: context.isDemo,
    });
    await recordGrowth(tx, {
      dedupeKey: `visit:${context.id}:${entry.id}`,
      type: entry.source === "CREATOR_PROFILE" ? "PROFILE_VIEW" : "SHARE_VISIT",
      attributionId: context.id,
      shareLinkId: entry.id,
      creatorId: context.creatorId ?? undefined,
      userId: user?.id,
      campaignId: context.campaignId ?? undefined,
      eventId: context.eventId ?? undefined,
      isDemo: context.isDemo,
    });
    await recordCampaignEntryStart(tx, context, entry.campaignId, user?.id);
    return {
      attributionToken,
      visitorToken,
      expiresAt: context.expiresAt,
      redirectTo: destination(entry),
      source: context.source,
    };
  });
}
function destination(entry: {
  source: string;
  campaignId: string | null;
  event: { slug: string } | null;
  creator: { handle: string | null } | null;
}) {
  if (entry.source === "REFERRAL") return "/register";
  if (entry.campaignId)
    return `/app/opportunities?campaign=${encodeURIComponent(entry.campaignId)}`;
  if (entry.event) return `/events/${encodeURIComponent(entry.event.slug)}`;
  return entry.creator?.handle ? `/@${entry.creator.handle}` : "/";
}
export async function bindAttribution(
  user: User,
  tokens?: AttributionTokens,
  options: { registration: boolean } = { registration: false },
) {
  return atomic(async (tx) => {
    const loaded = await loadAttribution(tx, tokens, user.id);
    if (!loaded) {
      if (options.registration)
        await recordGrowth(tx, {
          dedupeKey: `registration:${user.id}`,
          type: "REGISTRATION",
          userId: user.id,
          isDemo: user.isDemo,
        });
      return { bound: false };
    }
    if (loaded.creatorId) await eligibleCreator(tx, loaded.creatorId);
    const context = await bindContext(tx, loaded, user.id);
    let referralCreated = false;
    if (options.registration) {
      await recordGrowth(tx, {
        dedupeKey: `registration:${user.id}`,
        type: "REGISTRATION",
        attributionId: context.id,
        shareLinkId: context.shareLinkId,
        creatorId: context.creatorId ?? undefined,
        userId: user.id,
        campaignId: context.campaignId ?? undefined,
        eventId: context.eventId ?? undefined,
        isDemo: context.isDemo || user.isDemo,
      });
      if (context.referrerId) referralCreated = await establishDirectReferral(tx, context, user);
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ATTRIBUTION_BOUND",
        targetId: context.id,
        details: {
          registration: options.registration,
          referralCreated,
          source: context.source,
          ruleVersion: context.ruleVersion,
        },
      },
    });
    return { bound: true, attributionId: context.id, referralCreated };
  });
}
export async function resolveActivityAttribution(
  tx: Tx,
  user: User,
  campaign: Campaign,
  eventId: string | undefined,
  tokens?: AttributionTokens,
) {
  let context = await loadAttribution(tx, tokens, user.id);
  if (!context) return null;
  context = await bindContext(tx, context, user.id);
  const policy = z
    .object({ attribution: attributionPolicySchema, referral: referralPolicySchema })
    .parse(context.policySnapshot);
  assertAttributionUse({
    boundUserId: context.boundUserId,
    userId: user.id,
    creatorId: context.creatorId,
    advertiserId: campaign.advertiserId,
    contextCampaignId: context.campaignId,
    campaignId: campaign.id,
    contextEventId: context.eventId,
    eventId: eventId ?? null,
    firstTouchAt: context.firstTouchAt,
    expiresAt: context.expiresAt,
    occurredAt: new Date(),
    status: context.status,
    usedActivities: await tx.activity.count({ where: { attributionId: context.id } }),
    policy: policy.attribution,
  });
  if (context.creatorId) await eligibleCreator(tx, context.creatorId, campaign);
  assert(
    context.referrerId !== campaign.advertiserId,
    "SELF_REFERRAL",
    "An advertiser cannot receive referral credit for their own campaign.",
    403,
  );
  return {
    context,
    snapshot: jsonValue({
      contextId: context.id,
      creatorId: context.creatorId,
      referrerId: context.referrerId,
      source: context.source,
      ruleVersion: context.ruleVersion,
      policy,
      firstTouchAt: context.firstTouchAt,
      expiresAt: context.expiresAt,
      boundUserId: user.id,
      campaignId: campaign.id,
      eventId: eventId ?? null,
    }),
  };
}
export async function verifyActivityAttribution(
  tx: Tx,
  activity: {
    attributionId: string | null;
    attributionSnapshot: unknown;
    creatorId: string | null;
    userId: string;
    campaignId: string;
    eventId: string | null;
    createdAt: Date;
  },
  campaign: Campaign,
) {
  if (!activity.attributionId) {
    assert(
      !activity.creatorId,
      "UNTRUSTED_CREATOR_ATTRIBUTION",
      "This legacy creator claim needs independent re-attribution; it cannot create new creator RU.",
      409,
    );
    return;
  }
  const context = await tx.attributionContext.findUniqueOrThrow({
    where: { id: activity.attributionId },
  });
  const policy = z
    .object({ attribution: attributionPolicySchema, referral: referralPolicySchema })
    .parse(context.policySnapshot);
  assertAttributionUse({
    boundUserId: context.boundUserId,
    userId: activity.userId,
    creatorId: context.creatorId,
    advertiserId: campaign.advertiserId,
    contextCampaignId: context.campaignId,
    campaignId: campaign.id,
    contextEventId: context.eventId,
    eventId: activity.eventId,
    firstTouchAt: context.firstTouchAt,
    expiresAt: context.expiresAt,
    occurredAt: activity.createdAt,
    status: context.status,
    usedActivities: 0,
    policy: policy.attribution,
  });
  assert(
    context.creatorId === activity.creatorId &&
      isDeepStrictEqual(
        activity.attributionSnapshot,
        jsonValue({
          contextId: context.id,
          creatorId: context.creatorId,
          referrerId: context.referrerId,
          source: context.source,
          ruleVersion: context.ruleVersion,
          policy,
          firstTouchAt: context.firstTouchAt,
          expiresAt: context.expiresAt,
          boundUserId: activity.userId,
          campaignId: campaign.id,
          eventId: activity.eventId,
        }),
      ),
    "ATTRIBUTION_SNAPSHOT_MISMATCH",
    "Attribution provenance does not match the activity.",
    409,
  );
  assert(
    isDevelopment() || !context.isDemo,
    "DEMO_PRODUCTION_BLOCKED",
    "Development attribution cannot create live rewards.",
    403,
  );
  assert(
    context.referrerId !== campaign.advertiserId,
    "SELF_REFERRAL",
    "Advertisers cannot receive referral credit for their own campaign.",
    403,
  );
  if (context.creatorId) await eligibleCreator(tx, context.creatorId, campaign);
}
export async function recordEventJoin(
  tx: Tx,
  userId: string,
  eventId: string,
  tokens?: AttributionTokens,
) {
  let context: AttributionContext | null = null;
  try {
    context = await loadAttribution(tx, tokens, userId);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
  if (context?.eventId && context.eventId !== eventId) context = null;
  const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
  await recordGrowth(tx, {
    dedupeKey: `event-join:${eventId}:${userId}`,
    type: "EVENT_JOIN",
    attributionId: context?.id,
    shareLinkId: context?.shareLinkId,
    creatorId: context?.creatorId ?? undefined,
    userId,
    eventId,
    isDemo: event.isDemo || Boolean(context?.isDemo),
  });
}

/** Anonymous public event entry; the owner and optional creator host are resolved only on the server. */
export async function getEventEntry(slug: string) {
  return atomic(async (tx) => {
    const event = await tx.event.findUnique({ where: { slug } });
    assert(
      event &&
        ["ACTIVE", "SCHEDULED", "COMPLETED", "SETTLED"].includes(event.state) &&
        event.visibility === "PUBLIC",
      "EVENT_NOT_FOUND",
      "Public event not found.",
      404,
    );
    const ownerId =
      event.ownerId ??
      event.sponsorId ??
      event.hostId ??
      (
        await tx.user.findFirst({
          where: { roles: { has: "ADMIN" }, suspended: false },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      )?.id;
    assert(ownerId, "EVENT_OWNER_REQUIRED", "This event has no operator-backed share origin.", 409);
    let creatorId: string | undefined;
    if (event.hostId && event.hostId !== event.sponsorId) {
      try {
        creatorId = (await eligibleCreator(tx, event.hostId)).id;
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "CREATOR_INELIGIBLE") throw error;
      }
    }
    return ensureEntry(tx, {
      ownerId,
      creatorId,
      eventId: event.id,
      source: "EVENT",
      isDemo: event.isDemo,
    });
  });
}

async function availableCampaign(tx: Tx, campaign: Campaign) {
  const now = new Date();
  assert(
    campaign.state === "ACTIVE" &&
      campaign.startAt <= now &&
      campaign.endAt > now &&
      (isDevelopment() || !campaign.isDemo),
    "CAMPAIGN_INACTIVE",
    "This campaign is unavailable.",
    409,
  );
  assert(
    (await balance(tx, `campaign:${campaign.id}`)) >= campaign.unitCostMinor,
    "INSUFFICIENT_FUNDS",
    "This campaign's budget is exhausted.",
    409,
  );
}
/** Legacy referral URLs resolve the eligible public account to the same opaque server entry. */
export async function getReferralEntry(handle: string) {
  const user = await db.user.findUnique({ where: { handle } });
  assert(user, "PROFILE_NOT_FOUND", "Profile not found.", 404);
  return createShareLink(user, { surface: "REFERRAL" });
}

async function recordCampaignEntryStart(
  tx: Tx,
  context: AttributionContext,
  campaignId: string | null,
  userId?: string,
) {
  if (!campaignId || (context.campaignId && context.campaignId !== campaignId)) return;
  await recordGrowth(tx, {
    dedupeKey: `campaign-start:${attributionSessionKey(context)}:${campaignId}`,
    type: "CAMPAIGN_START",
    attributionId: context.id,
    shareLinkId: context.shareLinkId,
    creatorId: context.creatorId ?? undefined,
    userId,
    campaignId,
    eventId: context.eventId ?? undefined,
    isDemo: context.isDemo,
  });
}

/** A same-creator anonymous referral upgrade preserves the original observed session. */
export function attributionSessionKey(context: Pick<AttributionContext, "id" | "policySnapshot">) {
  const captured = z
    .object({ creatorOriginContextId: z.string().optional() })
    .parse(context.policySnapshot);
  return captured.creatorOriginContextId ?? context.id;
}
