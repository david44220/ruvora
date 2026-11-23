import { z } from "zod";
import type { User } from "@prisma/client";
import { evaluatePersistedPolicy } from "../domains/policy";
import { SOCIAL_CHANNELS, type SocialChannel } from "../lib/social-channels";
import { atomic, db, jsonValue } from "./db";
import { AppError, assert } from "./errors";
import { activeRules } from "./rules";
import { publicUser } from "./auth";
import { listCampaigns } from "./campaigns";
import { canCreatorPromote } from "./campaign-eligibility";
import { createShareLink, getProfileEntry, recordGrowth } from "./attribution";
import { createPromoCode } from "./promo-codes";
import { safeUrl } from "./validation";
import { isDevelopment } from "./environment";

const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "app",
  "billing",
  "embed",
  "events",
  "explore",
  "forgot_password",
  "go",
  "help",
  "login",
  "moderator",
  "offers",
  "official",
  "onboarding",
  "privacy",
  "promote",
  "register",
  "reset_password",
  "root",
  "ruvora",
  "security",
  "share_card",
  "share_unavailable",
  "staff",
  "support",
  "system",
  "terms",
  "verify_email",
]);

const socialChannelEnum = z.enum(SOCIAL_CHANNELS);

export function platformToSocialChannel(platform: string): SocialChannel {
  const norm = platform.trim().toLowerCase();
  if (norm.includes("tiktok")) return "TIKTOK";
  if (norm.includes("instagram") || norm === "ig") return "INSTAGRAM_STORY";
  if (norm.includes("youtube") || norm === "yt") return "YOUTUBE";
  if (norm.includes("whatsapp")) return "WHATSAPP";
  if (norm.includes("snap")) return "SNAPCHAT";
  if (norm.includes("discord")) return "DISCORD";
  if (norm.includes("threads")) return "THREADS";
  if (norm.includes("linkedin")) return "LINKEDIN";
  if (norm === "x" || norm.includes("twitter")) return "X";
  return "DIRECT";
}

export async function getReferralFunnel(user: User) {
  const [referrals, credits, referralShares, rules] = await Promise.all([
    db.referral.findMany({
      where: { inviterId: user.id },
      include: {
        attribution: { select: { socialChannel: true } },
        invitee: {
          select: {
            id: true,
            handle: true,
            onboarded: true,
            _count: { select: { activities: { where: { state: "VALIDATED" } } } },
          },
        },
      },
    }),
    db.referralCredit.findMany({
      where: { referral: { inviterId: user.id } },
      include: {
        referral: { select: { attribution: { select: { socialChannel: true } } } },
        rewardUnit: { select: { state: true, amountMicros: true } },
      },
    }),
    db.shareLink.findMany({
      where: { ownerId: user.id, source: "REFERRAL", active: true },
      select: {
        id: true,
        socialChannel: true,
        _count: { select: { growthEvents: true } },
      },
    }),
    activeRules(db).catch(() => null),
  ]);

  const invitedCount = referrals.length;
  const publishedProfiles = referrals.filter((r) =>
    Boolean(r.invitee.handle && r.invitee.onboarded),
  ).length;
  const activeReferees = referrals.filter((r) => r.invitee._count.activities > 0).length;
  const validatedCredits = credits.filter((c) =>
    ["VALIDATED", "CONSUMED"].includes(c.rewardUnit.state),
  );
  const referralRuMicros = validatedCredits.reduce((sum, c) => sum + c.rewardUnit.amountMicros, 0n);

  const channelMap = new Map<
    string,
    {
      channel: string;
      visits: number;
      registrations: number;
      qualifiedReferees: number;
      referralRuMicros: bigint;
    }
  >();
  const touchChannel = (channel: string) => {
    const key = channel || "DIRECT";
    const row = channelMap.get(key) ?? {
      channel: key,
      visits: 0,
      registrations: 0,
      qualifiedReferees: 0,
      referralRuMicros: 0n,
    };
    channelMap.set(key, row);
    return row;
  };
  for (const s of referralShares) {
    if (s._count.growthEvents > 0 || s.socialChannel !== "DIRECT") {
      touchChannel(s.socialChannel).visits += s._count.growthEvents;
    }
  }
  for (const r of referrals) {
    const row = touchChannel(r.attribution?.socialChannel ?? "DIRECT");
    row.registrations++;
    if (r.invitee._count.activities > 0) row.qualifiedReferees++;
  }
  for (const c of validatedCredits) {
    const row = touchChannel(c.referral.attribution?.socialChannel ?? "DIRECT");
    row.referralRuMicros += c.rewardUnit.amountMicros;
  }
  const byChannel = [...channelMap.values()].sort(
    (a, b) =>
      b.qualifiedReferees - a.qualifiedReferees ||
      b.registrations - a.registrations ||
      b.visits - a.visits,
  );

  const referralPolicy = rules?.config.referral;
  return {
    invitedCount,
    publishedProfiles,
    activeReferees,
    validatedCreditsCount: validatedCredits.length,
    referralRuMicros,
    monthlyCapMicros: referralPolicy ? BigInt(referralPolicy.maxRewardPerReferrerPeriodMicros) : 0n,
    maxQualifiedReferees: referralPolicy?.maxQualifyingRefereesPerPeriod ?? 0,
    byChannel,
  };
}

export async function getChannelAnalytics(userId: string) {
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - 90 * 86400000);
  const [growth, activities] = await Promise.all([
    db.growthEvent.findMany({
      where: {
        OR: [{ creatorId: userId }, { userId, type: "SOCIAL_KIT_SHARED" }],
        occurredAt: { gte: startAt, lt: endAt },
      },
      select: { type: true, socialChannel: true },
    }),
    db.activity.findMany({
      where: {
        creatorId: userId,
        createdAt: { gte: startAt, lt: endAt },
      },
      include: {
        attribution: { select: { socialChannel: true } },
        rewards: {
          where: { userId, category: "CREATOR" },
          select: { amountMicros: true, state: true },
        },
      },
    }),
  ]);

  const rows = new Map<
    string,
    {
      channel: string;
      visits: number;
      sessions: number;
      registrations: number;
      kitShares: number;
      validatedActions: number;
      creatorRuMicros: bigint;
    }
  >();

  const touch = (channel: string) => {
    const key = channel || "DIRECT";
    const cur = rows.get(key) ?? {
      channel: key,
      visits: 0,
      sessions: 0,
      registrations: 0,
      kitShares: 0,
      validatedActions: 0,
      creatorRuMicros: 0n,
    };
    rows.set(key, cur);
    return cur;
  };

  for (const event of growth) {
    const row = touch(event.socialChannel);
    if (event.type === "PROFILE_VIEW" || event.type === "SHARE_VISIT") row.visits++;
    else if (event.type === "ATTRIBUTED_SESSION") row.sessions++;
    else if (event.type === "REGISTRATION") row.registrations++;
    else if (event.type === "SOCIAL_KIT_SHARED") row.kitShares++;
  }

  for (const act of activities) {
    const ch = act.attribution?.socialChannel ?? "DIRECT";
    const row = touch(ch);
    if (act.state === "VALIDATED") {
      row.validatedActions++;
      for (const u of act.rewards) {
        if (["VALIDATED", "CONSUMED"].includes(u.state)) {
          row.creatorRuMicros += u.amountMicros;
        }
      }
    }
  }

  return [...rows.values()]
    .map((r) => ({
      ...r,
      conversionRatePct: r.visits > 0 ? Math.round((r.validatedActions / r.visits) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.validatedActions - a.validatedActions || b.visits - a.visits);
}

export async function getPromoteHub(user: User) {
  const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const rules = await activeRules(db).catch(() => null);
  const followerThreshold = rules?.config.creatorFollowerThreshold ?? 10;
  const isCreatorEligible = Boolean(
    rules && evaluatePersistedPolicy(fresh, "CREATOR_MONETIZATION", rules.config).eligible,
  );
  const canParticipate = Boolean(
    rules && evaluatePersistedPolicy(fresh, "PARTICIPATION", rules.config).eligible,
  );

  let profileEntry: { slug: string; url: string; socialChannel: string } | null = null;
  let referralEntry: { slug: string; url: string; socialChannel: string } | null = null;

  if (isCreatorEligible && fresh.handle) {
    try {
      profileEntry = await getProfileEntry(fresh.handle);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  if (canParticipate) {
    try {
      referralEntry = await createShareLink(fresh, {
        surface: "REFERRAL",
        socialChannel: "DIRECT",
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }

  const [
    campaignList,
    shareLinks,
    promoCodes,
    showcaseRows,
    channelAnalytics,
    referralFunnel,
    retention,
    postPlansResult,
    collectionsResult,
    audienceResult,
  ] = await Promise.all([
    listCampaigns(fresh, { forCreator: fresh.roles.includes("CREATOR") }),
    db.shareLink.findMany({
      where: { ownerId: fresh.id, active: true },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        campaign: { select: { id: true, name: true } },
        _count: { select: { growthEvents: true } },
      },
    }),
    db.promoCode.findMany({
      where: { creatorId: fresh.id, active: true },
      select: { campaignId: true, code: true, discountLabel: true, usesCount: true },
    }),
    db.creatorShowcaseItem.findMany({
      where: { creatorId: fresh.id, pinned: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
            objective: true,
            state: true,
            creativeBrief: true,
          },
        },
      },
    }),
    getChannelAnalytics(fresh.id),
    getReferralFunnel(fresh),
    import("./retention").then((m) => m.getCreatorRetentionSummary(fresh.id)),
    import("./retention").then((m) => m.listPostPlans(fresh)),
    import("./collections").then((m) => m.listCreatorCollections(fresh)),
    import("./audience-capture").then((m) => m.listCreatorAudienceSubscribers(fresh)),
  ]);

  const promoByCampaign = new Map(promoCodes.map((p) => [p.campaignId, p]));
  const showcaseByCampaign = new Map(showcaseRows.map((s) => [s.campaignId, s]));

  const campaigns = campaignList.campaigns
    .filter((c) => c.state === "ACTIVE" && (!("advertiserId" in c) || c.advertiserId !== fresh.id))
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      objective: c.objective,
      deliveryMode: c.deliveryMode,
      creativeBrief: c.creativeBrief,
      canParticipate: c.canParticipate,
      isDemo: c.isDemo,
      promoCode: promoByCampaign.get(c.id) ?? null,
      showcaseItem: showcaseByCampaign.get(c.id)
        ? {
            id: showcaseByCampaign.get(c.id)!.id,
            collectionName: showcaseByCampaign.get(c.id)!.collectionName,
            creatorNote: showcaseByCampaign.get(c.id)!.creatorNote,
          }
        : null,
    }));

  return {
    user: publicUser(fresh),
    isCreatorEligible,
    canParticipate,
    followerThreshold,
    profileEntry,
    referralEntry,
    campaigns,
    shareLinks: shareLinks.map((l) => ({
      id: l.id,
      slug: l.slug,
      customSlug: l.customSlug,
      url: `/go/${l.slug}`,
      customUrl: l.customSlug ? `/go/${l.customSlug}` : null,
      bridgeEnabled: l.bridgeEnabled,
      source: l.source,
      socialChannel: l.socialChannel,
      campaignId: l.campaignId,
      campaignName: l.campaign?.name ?? null,
      eventsCount: l._count.growthEvents,
      createdAt: l.createdAt,
    })),
    showcase: showcaseRows.map((s) => ({
      id: s.id,
      campaignId: s.campaignId,
      collectionName: s.collectionName,
      creatorNote: s.creatorNote,
      sortOrder: s.sortOrder,
      campaign: s.campaign,
      promoCode: promoByCampaign.get(s.campaignId)?.code ?? null,
    })),
    channelAnalytics,
    referralFunnel,
    retention,
    postPlans: postPlansResult.plans,
    collections: collectionsResult.collections,
    audience: audienceResult,
  };
}

const quickStartSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,24}$/)
      .refine((v) => !RESERVED_HANDLES.has(v), "This handle is reserved."),
    displayName: z.string().trim().min(2).max(60),
    bio: z.string().trim().max(300).default(""),
    category: z.string().trim().min(2).max(40).default("Creator"),
    country: z.string().regex(/^[A-Z]{2}$/),
    city: z.string().trim().max(60).optional(),
    primaryPlatform: z.string().trim().min(1).max(30),
    primarySocialUrl: safeUrl,
    followers: z.number().int().min(0).max(1000000000),
    campaignIds: z.array(z.string().min(4).max(80)).max(3).default([]),
    collectionName: z.string().trim().min(1).max(50).default("Mes Bons Plans"),
    ageEligible: z.literal(true),
    termsAccepted: z.literal(true),
  })
  .strict();

export async function quickStartPromote(user: User, input: unknown) {
  const value = quickStartSchema.parse(input);
  const updatedUser = await atomic(async (tx) => {
    const conflict = await tx.user.findUnique({ where: { handle: value.handle } });
    assert(
      !conflict || conflict.id === user.id,
      "HANDLE_UNAVAILABLE",
      "This handle is already in use.",
      409,
    );
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const existingSocials = Array.isArray(current.socialLinks)
      ? (current.socialLinks as { platform: string; url: string; followers: number }[])
      : [];
    const filteredSocials = existingSocials.filter(
      (s) => s.platform.toLowerCase() !== value.primaryPlatform.toLowerCase(),
    );
    const nextSocials = [
      { platform: value.primaryPlatform, url: value.primarySocialUrl, followers: value.followers },
      ...filteredSocials,
    ].slice(0, 10);
    const nextFollowers = Math.max(0, ...nextSocials.map((s) => s.followers));
    const keepVerified =
      current.audienceStatus === "VERIFIED" &&
      nextFollowers <= current.followers &&
      nextFollowers >= 10;
    const roles = [...new Set([...current.roles, "USER" as const, "CREATOR" as const])];

    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        handle: value.handle,
        displayName: value.displayName,
        bio: value.bio || current.bio,
        category: value.category,
        country: value.country,
        ...(value.city !== undefined ? { city: value.city || null } : {}),
        ageEligible: true,
        termsAcceptedAt: current.termsAcceptedAt ?? new Date(),
        onboarded: true,
        autoMonetize: true,
        directoryOptIn: true,
        roles,
        socialLinks: jsonValue(nextSocials),
        followers: nextFollowers,
        audienceStatus: keepVerified ? "VERIFIED" : "SELF_DECLARED",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SOCIAL_PROMOTER_QUICKSTART",
        targetId: user.id,
        details: {
          handle: value.handle,
          primaryPlatform: value.primaryPlatform,
          requestedCampaigns: value.campaignIds.length,
        },
      },
    });
    return updated;
  });

  const primaryChannel = platformToSocialChannel(value.primaryPlatform);
  const createdLinks: { campaignId?: string; url: string; socialChannel: string }[] = [];
  const createdPromoCodes: { campaignId: string; code: string }[] = [];

  // Create profile & referral links on primary channel
  try {
    const profileLink = await createShareLink(updatedUser, {
      surface: "PROFILE",
      socialChannel: primaryChannel,
    });
    createdLinks.push({ url: profileLink.url, socialChannel: profileLink.socialChannel });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }

  try {
    const refLink = await createShareLink(updatedUser, {
      surface: "REFERRAL",
      socialChannel: primaryChannel,
    });
    createdLinks.push({ url: refLink.url, socialChannel: refLink.socialChannel });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }

  // Wire selected campaigns (links + promo codes + showcase pins)
  for (let i = 0; i < value.campaignIds.length; i++) {
    const campaignId = value.campaignIds[i]!;
    try {
      const campLink = await createShareLink(updatedUser, {
        surface: "CAMPAIGN",
        targetId: campaignId,
        socialChannel: primaryChannel,
      });
      createdLinks.push({
        campaignId,
        url: campLink.url,
        socialChannel: campLink.socialChannel,
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }

    try {
      const promo = await createPromoCode(updatedUser, { campaignId });
      createdPromoCodes.push({ campaignId, code: promo.promoCode.code });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }

    try {
      await upsertShowcaseItem(updatedUser, {
        campaignId,
        collectionName: value.collectionName,
        creatorNote: "",
        sortOrder: i,
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }

  return {
    user: publicUser(updatedUser),
    primaryChannel,
    createdLinks,
    createdPromoCodes,
  };
}

const showcaseSchema = z
  .object({
    campaignId: z.string().min(4).max(100),
    collectionName: z.string().trim().min(1).max(50).default("Picks"),
    creatorNote: z.string().trim().max(220).default(""),
    sortOrder: z.number().int().min(0).max(50).optional(),
  })
  .strict();

export async function upsertShowcaseItem(user: User, input: unknown) {
  const value = showcaseSchema.parse(input);
  return atomic(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const { config } = await activeRules(tx);
    assert(
      evaluatePersistedPolicy(actor, "CREATOR_MONETIZATION", config).eligible,
      "CREATOR_INELIGIBLE",
      "Creator eligibility is required to curate public showcase picks.",
      403,
    );
    const campaign = await tx.campaign.findUnique({ where: { id: value.campaignId } });
    const now = new Date();
    assert(
      campaign &&
        campaign.state === "ACTIVE" &&
        campaign.startAt <= now &&
        campaign.endAt > now &&
        (isDevelopment() || !campaign.isDemo),
      "CAMPAIGN_INACTIVE",
      "Only active campaigns can be pinned to your showcase.",
      409,
    );
    assert(
      campaign.advertiserId !== actor.id,
      "SELF_ATTRIBUTION",
      "You cannot pin your own advertised campaign as a creator pick.",
      403,
    );
    assert(
      canCreatorPromote(actor, campaign),
      "CREATOR_CAMPAIGN_INELIGIBLE",
      "Your profile does not match this campaign's targeting policy.",
      403,
    );

    const existing = await tx.creatorShowcaseItem.findUnique({
      where: { creatorId_campaignId: { creatorId: actor.id, campaignId: campaign.id } },
    });
    if (!existing) {
      const currentPinned = await tx.creatorShowcaseItem.count({
        where: { creatorId: actor.id, pinned: true },
      });
      assert(
        currentPinned < 6,
        "SHOWCASE_LIMIT",
        "You can pin up to 6 active campaigns in your showcase.",
        409,
      );
    }

    const item = await tx.creatorShowcaseItem.upsert({
      where: { creatorId_campaignId: { creatorId: actor.id, campaignId: campaign.id } },
      create: {
        creatorId: actor.id,
        campaignId: campaign.id,
        collectionName: value.collectionName,
        creatorNote: value.creatorNote,
        sortOrder: value.sortOrder ?? 0,
        pinned: true,
      },
      update: {
        collectionName: value.collectionName,
        creatorNote: value.creatorNote,
        ...(value.sortOrder !== undefined ? { sortOrder: value.sortOrder } : {}),
        pinned: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "SHOWCASE_ITEM_SAVED",
        targetId: item.id,
        details: { campaignId: campaign.id, collectionName: value.collectionName },
      },
    });
    return { item };
  });
}

export async function removeShowcaseItem(user: User, input: unknown) {
  const { campaignId } = z
    .object({ campaignId: z.string().min(4).max(100) })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const existing = await tx.creatorShowcaseItem.findUnique({
      where: { creatorId_campaignId: { creatorId: user.id, campaignId } },
    });
    assert(existing, "NOT_FOUND", "Showcase item not found.", 404);
    await tx.creatorShowcaseItem.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SHOWCASE_ITEM_REMOVED",
        targetId: existing.id,
        details: { campaignId },
      },
    });
    return { removed: true };
  });
}

export async function recordSocialShareTelemetry(user: User, input: unknown) {
  const value = z
    .object({
      socialChannel: socialChannelEnum,
      surface: z.enum(["PROFILE", "CAMPAIGN", "REFERRAL", "EVENT"]).default("PROFILE"),
      campaignId: z.string().min(4).max(100).optional(),
    })
    .strict()
    .parse(input);
  const day = new Date().toISOString().slice(0, 10);
  const dedupeKey = `social-kit:${user.id}:${value.socialChannel}:${value.surface}:${value.campaignId ?? "none"}:${day}`;
  await atomic(async (tx) => {
    await recordGrowth(tx, {
      dedupeKey,
      type: "SOCIAL_KIT_SHARED",
      socialChannel: value.socialChannel,
      creatorId: user.roles.includes("CREATOR") ? user.id : undefined,
      userId: user.id,
      campaignId: value.campaignId,
      isDemo: user.isDemo,
    });
  });
  return { recorded: true, currencyImpact: "NONE" as const };
}
