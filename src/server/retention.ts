import { z } from "zod";
import type { User } from "@prisma/client";
import { atomic, db, jsonValue } from "./db";
import { assert } from "./errors";
import { isDevelopment } from "./environment";
import { SOCIAL_CHANNELS } from "../lib/social-channels";
import { buildPostPlanIcs } from "../lib/ics";
import {
  computeCreatorBadges,
  computeWeeklyStreak,
  xpLevel,
  type CreatorBadge,
  type WeeklyStreakSummary,
} from "../lib/retention";
import {
  normalizeNotificationPrefs,
  notificationPrefsSchema,
  type NotificationPrefs,
} from "../lib/notification-prefs";
import { queueSecurityMail } from "./security/email";
import { getCreatorReliability } from "./risk";

const socialChannelEnum = z.enum(SOCIAL_CHANNELS);

const checklistSchema = z
  .object({
    linkReady: z.boolean().default(false),
    codeCopied: z.boolean().default(false),
    disclosureIncluded: z.boolean().default(true),
  })
  .strict();

const createPostPlanSchema = z
  .object({
    campaignId: z.string().min(4).max(100).nullable().optional(),
    socialChannel: socialChannelEnum.default("INSTAGRAM_STORY"),
    title: z.string().trim().min(3).max(120),
    scheduledFor: z.iso.datetime(),
    note: z.string().trim().max(400).default(""),
    checklist: checklistSchema.optional(),
  })
  .strict();

const updatePostPlanSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    scheduledFor: z.iso.datetime().optional(),
    socialChannel: socialChannelEnum.optional(),
    status: z.enum(["PLANNED", "PUBLISHED", "SKIPPED"]).optional(),
    note: z.string().trim().max(400).optional(),
    checklist: checklistSchema.optional(),
  })
  .strict();

export async function listPostPlans(user: User) {
  const rows = await db.creatorPostPlan.findMany({
    where: { userId: user.id },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      campaign: { select: { id: true, name: true, state: true } },
    },
  });
  return {
    plans: rows.map((p) => ({
      id: p.id,
      campaignId: p.campaignId,
      campaignName: p.campaign?.name ?? null,
      socialChannel: p.socialChannel,
      title: p.title,
      scheduledFor: p.scheduledFor.toISOString(),
      status: p.status,
      note: p.note,
      checklist: checklistSchema
        .catch({
          linkReady: false,
          codeCopied: false,
          disclosureIncluded: true,
        })
        .parse(p.checklist),
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

/** Creates a CreatorPostPlan entry. Strictly planning telemetry (0 EUR / 0 RU). */
export async function createPostPlan(user: User, input: unknown) {
  const value = createPostPlanSchema.parse(input);
  return atomic(async (tx) => {
    const count = await tx.creatorPostPlan.count({ where: { userId: user.id } });
    assert(count < 100, "POST_PLAN_LIMIT", "Maximum of 100 scheduled posts reached.", 409);

    let campaignId: string | null = null;
    if (value.campaignId) {
      const campaign = await tx.campaign.findUnique({
        where: { id: value.campaignId },
        select: { id: true, state: true, isDemo: true },
      });
      assert(
        campaign && (isDevelopment() || !campaign.isDemo),
        "CAMPAIGN_INACTIVE",
        "The selected campaign is unavailable.",
        404,
      );
      campaignId = campaign.id;
    }

    const plan = await tx.creatorPostPlan.create({
      data: {
        userId: user.id,
        campaignId,
        socialChannel: value.socialChannel,
        title: value.title,
        scheduledFor: new Date(value.scheduledFor),
        note: value.note,
        checklist: jsonValue(
          value.checklist ?? { linkReady: false, codeCopied: false, disclosureIncluded: true },
        ),
      },
      include: { campaign: { select: { id: true, name: true } } },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "POST_PLAN_CREATED",
        targetId: plan.id,
        details: {
          socialChannel: plan.socialChannel,
          campaignId: plan.campaignId,
          currencyImpact: "NONE",
        },
      },
    });

    return {
      plan: {
        id: plan.id,
        campaignId: plan.campaignId,
        campaignName: plan.campaign?.name ?? null,
        socialChannel: plan.socialChannel,
        title: plan.title,
        scheduledFor: plan.scheduledFor.toISOString(),
        status: plan.status,
        note: plan.note,
        checklist: value.checklist ?? {
          linkReady: false,
          codeCopied: false,
          disclosureIncluded: true,
        },
        publishedAt: null,
        createdAt: plan.createdAt.toISOString(),
      },
      currencyImpact: "NONE" as const,
    };
  });
}

export async function updatePostPlan(user: User, planId: string, input: unknown) {
  const value = updatePostPlanSchema.parse(input);
  return atomic(async (tx) => {
    const existing = await tx.creatorPostPlan.findUnique({ where: { id: planId } });
    assert(existing && existing.userId === user.id, "NOT_FOUND", "Post plan not found.", 404);

    const nextStatus = value.status ?? existing.status;
    const publishedAt =
      nextStatus === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt;

    const updated = await tx.creatorPostPlan.update({
      where: { id: existing.id },
      data: {
        ...(value.title !== undefined ? { title: value.title } : {}),
        ...(value.scheduledFor !== undefined ? { scheduledFor: new Date(value.scheduledFor) } : {}),
        ...(value.socialChannel !== undefined ? { socialChannel: value.socialChannel } : {}),
        ...(value.status !== undefined ? { status: value.status, publishedAt } : {}),
        ...(value.note !== undefined ? { note: value.note } : {}),
        ...(value.checklist !== undefined ? { checklist: jsonValue(value.checklist) } : {}),
      },
      include: { campaign: { select: { id: true, name: true } } },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "POST_PLAN_UPDATED",
        targetId: updated.id,
        details: { status: updated.status, currencyImpact: "NONE" },
      },
    });

    return {
      plan: {
        id: updated.id,
        campaignId: updated.campaignId,
        campaignName: updated.campaign?.name ?? null,
        socialChannel: updated.socialChannel,
        title: updated.title,
        scheduledFor: updated.scheduledFor.toISOString(),
        status: updated.status,
        note: updated.note,
        checklist: checklistSchema
          .catch({
            linkReady: false,
            codeCopied: false,
            disclosureIncluded: true,
          })
          .parse(updated.checklist),
        publishedAt: updated.publishedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
      currencyImpact: "NONE" as const,
    };
  });
}

export async function deletePostPlan(user: User, planId: string) {
  return atomic(async (tx) => {
    const existing = await tx.creatorPostPlan.findUnique({ where: { id: planId } });
    assert(existing && existing.userId === user.id, "NOT_FOUND", "Post plan not found.", 404);
    await tx.creatorPostPlan.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "POST_PLAN_DELETED",
        targetId: existing.id,
        details: { currencyImpact: "NONE" },
      },
    });
    return { deleted: true };
  });
}

export async function getPostPlanIcs(user: User, planId: string) {
  const plan = await db.creatorPostPlan.findUnique({
    where: { id: planId },
    include: { campaign: { select: { name: true } } },
  });
  assert(plan && plan.userId === user.id, "NOT_FOUND", "Post plan not found.", 404);
  const origin = process.env.APP_URL || "http://localhost:3000";
  const ics = buildPostPlanIcs({
    id: plan.id,
    title: plan.title,
    scheduledFor: plan.scheduledFor,
    socialChannel: plan.socialChannel,
    campaignName: plan.campaign?.name,
    note: plan.note,
    appUrl: origin,
  });
  const safeId = plan.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "plan";
  return { filename: `ruvora-post-plan-${safeId}.ics`, content: ics };
}

export interface CreatorRetentionSummary {
  totalXp: number;
  level: number;
  streak: WeeklyStreakSummary;
  badges: CreatorBadge[];
  publishedPlansCount: number;
  scheduledPlansCount: number;
  leaderboardOptIn: boolean;
}

/**
 * Computes strictly XP-only streak, level, and milestone badges for a creator.
 * Never reads or leaks monetary or RU figures.
 */
export async function getCreatorRetentionSummary(userId: string): Promise<CreatorRetentionSummary> {
  const [
    user,
    actXpAgg,
    questXpAgg,
    socialShares,
    shareLinks,
    publishedPlans,
    scheduledPlansCount,
    validatedActivities,
    showcaseCount,
    referralsCount,
    eventsCount,
  ] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { audienceStatus: true, leaderboardOptIn: true },
    }),
    db.xpEntry.aggregate({ where: { userId }, _sum: { amount: true } }),
    db.questClaim.aggregate({ where: { userId }, _sum: { xpAwarded: true } }),
    db.growthEvent.findMany({
      where: { userId, type: "SOCIAL_KIT_SHARED" },
      select: { occurredAt: true, socialChannel: true },
      orderBy: { occurredAt: "desc" },
      take: 400,
    }),
    db.shareLink.findMany({
      where: { ownerId: userId, active: true },
      select: { createdAt: true, socialChannel: true },
      take: 200,
    }),
    db.creatorPostPlan.findMany({
      where: { userId, status: "PUBLISHED" },
      select: { publishedAt: true, updatedAt: true },
      take: 200,
    }),
    db.creatorPostPlan.count({ where: { userId, status: "PLANNED" } }),
    db.activity.findMany({
      where: { OR: [{ userId }, { creatorId: userId }], state: "VALIDATED" },
      select: { validatedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.creatorShowcaseItem.count({ where: { creatorId: userId, pinned: true } }),
    db.referral.count({ where: { inviterId: userId } }),
    db.eventMembership.count({ where: { userId } }),
  ]);

  const totalXp = Math.max(0, (actXpAgg._sum.amount ?? 0) + (questXpAgg._sum.xpAwarded ?? 0));
  const activityDates: Date[] = [
    ...socialShares.map((s) => s.occurredAt),
    ...shareLinks.filter((l) => l.socialChannel !== "DIRECT").map((l) => l.createdAt),
    ...publishedPlans.map((p) => p.publishedAt ?? p.updatedAt),
    ...validatedActivities.map((a) => a.validatedAt ?? a.createdAt),
  ];

  const streak = computeWeeklyStreak(activityDates);
  const distinctChannels = new Set<string>([
    ...socialShares.map((s) => s.socialChannel).filter((c) => c !== "DIRECT"),
    ...shareLinks.map((l) => l.socialChannel).filter((c) => c !== "DIRECT"),
  ]);
  const badges = computeCreatorBadges({
    socialChannelsCount: distinctChannels.size,
    audienceVerified: user.audienceStatus === "VERIFIED",
    showcasePinnedCount: showcaseCount,
    longestStreakWeeks: streak.longestStreakWeeks,
    referralsCount,
    eventMembershipsCount: eventsCount,
    hasActiveSocialShare: socialShares.length > 0 || shareLinks.length > 0,
  });

  return {
    totalXp,
    level: xpLevel(totalXp),
    streak,
    badges,
    publishedPlansCount: publishedPlans.length,
    scheduledPlansCount,
    leaderboardOptIn: user.leaderboardOptIn,
  };
}

export interface PublicLeaderboardEntry {
  rank: number;
  handle: string;
  displayName: string;
  category: string;
  country: string | null;
  audienceStatus: string;
  totalXp: number;
  level: number;
  streakWeeks: number;
  reliabilityTier: string;
  badges: CreatorBadge[];
  isDemo: boolean;
}

/**
 * Public opt-in community leaderboard ranked strictly by XP & reliability.
 * Never includes monetary or Reward Unit balances, and strictly requires leaderboardOptIn = true.
 */
export async function getPublicOptInLeaderboard(limit = 15): Promise<PublicLeaderboardEntry[]> {
  const dev = isDevelopment();
  const optedIn = await db.user.findMany({
    where: {
      leaderboardOptIn: true,
      suspended: false,
      economicHold: false,
      anonymizedAt: null,
      handle: { not: null },
      ...(dev ? {} : { isDemo: false }),
    },
    select: {
      id: true,
      handle: true,
      displayName: true,
      category: true,
      country: true,
      audienceStatus: true,
      emailVerifiedAt: true,
      isDemo: true,
    },
    take: 60,
  });
  if (optedIn.length === 0) return [];

  const userIds = optedIn.map((u) => u.id);
  const [actXpRows, questXpRows, shareRows, kitRows, planRows, showcaseRows, refRows, evRows] =
    await Promise.all([
      db.xpEntry.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _sum: { amount: true },
      }),
      db.questClaim.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _sum: { xpAwarded: true },
      }),
      db.shareLink.findMany({
        where: { ownerId: { in: userIds }, active: true },
        select: { ownerId: true, socialChannel: true, createdAt: true },
      }),
      db.growthEvent.findMany({
        where: { userId: { in: userIds }, type: "SOCIAL_KIT_SHARED" },
        select: { userId: true, socialChannel: true, occurredAt: true },
      }),
      db.creatorPostPlan.findMany({
        where: { userId: { in: userIds }, status: "PUBLISHED" },
        select: { userId: true, publishedAt: true, updatedAt: true },
      }),
      db.creatorShowcaseItem.groupBy({
        by: ["creatorId"],
        where: { creatorId: { in: userIds }, pinned: true },
        _count: { _all: true },
      }),
      db.referral.groupBy({
        by: ["inviterId"],
        where: { inviterId: { in: userIds } },
        _count: { _all: true },
      }),
      db.eventMembership.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _count: { _all: true },
      }),
    ]);

  const actXpMap = new Map(actXpRows.map((r) => [r.userId, r._sum.amount ?? 0]));
  const questXpMap = new Map(questXpRows.map((r) => [r.userId, r._sum.xpAwarded ?? 0]));
  const showcaseMap = new Map(showcaseRows.map((r) => [r.creatorId, r._count._all]));
  const refMap = new Map(refRows.map((r) => [r.inviterId, r._count._all]));
  const evMap = new Map(evRows.map((r) => [r.userId, r._count._all]));

  const rankedRaw = await Promise.all(
    optedIn.map(async (u) => {
      const totalXp = Math.max(0, (actXpMap.get(u.id) ?? 0) + (questXpMap.get(u.id) ?? 0));
      const userShares = shareRows.filter((s) => s.ownerId === u.id);
      const userKits = kitRows.filter((k) => k.userId === u.id);
      const userPlans = planRows.filter((p) => p.userId === u.id);
      const dates: Date[] = [
        ...userKits.map((k) => k.occurredAt),
        ...userShares.filter((s) => s.socialChannel !== "DIRECT").map((s) => s.createdAt),
        ...userPlans.map((p) => p.publishedAt ?? p.updatedAt),
      ];
      const streak = computeWeeklyStreak(dates);
      const channels = new Set<string>([
        ...userShares.map((s) => s.socialChannel).filter((c) => c !== "DIRECT"),
        ...userKits.map((k) => k.socialChannel).filter((c) => c !== "DIRECT"),
      ]);
      const badges = computeCreatorBadges({
        socialChannelsCount: channels.size,
        audienceVerified: u.audienceStatus === "VERIFIED",
        showcasePinnedCount: showcaseMap.get(u.id) ?? 0,
        longestStreakWeeks: streak.longestStreakWeeks,
        referralsCount: refMap.get(u.id) ?? 0,
        eventMembershipsCount: evMap.get(u.id) ?? 0,
        hasActiveSocialShare: userShares.length > 0 || userKits.length > 0,
      });
      const reliability = await getCreatorReliability(db, {
        id: u.id,
        audienceStatus: u.audienceStatus,
        emailVerifiedAt: u.emailVerifiedAt,
      });
      return {
        handle: u.handle!,
        displayName: u.displayName,
        category: u.category,
        country: u.country,
        audienceStatus: u.audienceStatus,
        totalXp,
        level: xpLevel(totalXp),
        streakWeeks: streak.currentStreakWeeks,
        reliabilityScore: reliability.reliabilityScore,
        reliabilityTier: reliability.tier,
        badges,
        isDemo: u.isDemo,
      };
    }),
  );

  return rankedRaw
    .sort(
      (a, b) =>
        b.totalXp - a.totalXp ||
        b.reliabilityScore - a.reliabilityScore ||
        b.streakWeeks - a.streakWeeks ||
        a.handle.localeCompare(b.handle),
    )
    .slice(0, Math.min(Math.max(limit, 1), 30))
    .map((entry, idx) => ({
      rank: idx + 1,
      handle: entry.handle,
      displayName: entry.displayName,
      category: entry.category,
      country: entry.country,
      audienceStatus: entry.audienceStatus,
      totalXp: entry.totalXp,
      level: entry.level,
      streakWeeks: entry.streakWeeks,
      reliabilityTier: entry.reliabilityTier,
      badges: entry.badges,
      isDemo: entry.isDemo,
    }));
}

export async function getNotificationPreferences(user: User) {
  const fresh = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { notificationPrefs: true, lastWeeklyDigestAt: true },
  });
  return {
    preferences: normalizeNotificationPrefs(fresh.notificationPrefs),
    lastWeeklyDigestAt: fresh.lastWeeklyDigestAt?.toISOString() ?? null,
    development: isDevelopment(),
  };
}

export async function updateNotificationPreferences(user: User, input: unknown) {
  const parsed: NotificationPrefs = notificationPrefsSchema.parse(input);
  return atomic(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { notificationPrefs: jsonValue(parsed) },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "NOTIFICATION_PREFS_UPDATED",
        targetId: user.id,
        details: jsonValue(parsed),
      },
    });
    return { preferences: parsed };
  });
}

/**
 * Queues a transparent weekly XP & activity recap email into the encrypted MailOutbox.
 * Never makes earnings promises or exposes monetary secrets.
 */
export async function queueWeeklyDigestForUser(
  user: User,
  options: { bypassCooldownInDev?: boolean } = {},
) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [fresh, retention, recentSharesCount, activeCampaignsCount] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id } }),
    getCreatorRetentionSummary(user.id),
    db.growthEvent.count({
      where: {
        OR: [{ userId: user.id }, { creatorId: user.id }],
        occurredAt: { gte: weekAgo },
      },
    }),
    db.campaign.count({
      where: {
        state: "ACTIVE",
        startAt: { lte: now },
        endAt: { gt: now },
        ...(isDevelopment() ? {} : { isDemo: false }),
      },
    }),
  ]);

  assert(!fresh.suspended && !fresh.anonymizedAt, "FORBIDDEN", "Account unavailable.", 403);
  const allowBypass = Boolean(options.bypassCooldownInDev && isDevelopment());
  if (!allowBypass && fresh.lastWeeklyDigestAt && fresh.lastWeeklyDigestAt > weekAgo) {
    assert(false, "DIGEST_COOLDOWN", "A weekly digest was already queued recently.", 409);
  }

  return atomic(async (tx) => {
    const mailId = await queueSecurityMail(tx, fresh, "WEEKLY_DIGEST", {
      displayName: fresh.displayName,
      totalXp: String(retention.totalXp),
      level: String(retention.level),
      streakWeeks: String(retention.streak.currentStreakWeeks),
      weeklyEvents: String(recentSharesCount),
      publishedPlans: String(retention.publishedPlansCount),
      activeCampaigns: String(activeCampaignsCount),
      studioUrl: `${process.env.APP_URL || "http://localhost:3000"}/app/promote`,
    });
    await tx.user.update({
      where: { id: fresh.id },
      data: { lastWeeklyDigestAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorId: fresh.id,
        action: "WEEKLY_DIGEST_QUEUED",
        targetId: mailId,
        details: {
          level: retention.level,
          streakWeeks: retention.streak.currentStreakWeeks,
          currencyImpact: "NONE",
        },
      },
    });
    return { queued: true, mailId, development: isDevelopment() };
  });
}

/** Advisory-locked worker step queuing weekly digests for opted-in verified accounts due > 7 days. */
export async function queueDueWeeklyDigests(limit = 25) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const candidates = await db.user.findMany({
    where: {
      suspended: false,
      anonymizedAt: null,
      emailVerifiedAt: { not: null },
      ...(isDevelopment() ? {} : { isDemo: false }),
      OR: [{ lastWeeklyDigestAt: null }, { lastWeeklyDigestAt: { lte: weekAgo } }],
    },
    take: Math.min(Math.max(limit * 3, 25), 150),
  });

  const queuedIds: string[] = [];
  for (const user of candidates) {
    if (queuedIds.length >= limit) break;
    const prefs = normalizeNotificationPrefs(user.notificationPrefs);
    if (!prefs.weeklyDigestEmail) continue;
    try {
      const res = await queueWeeklyDigestForUser(user);
      queuedIds.push(res.mailId);
    } catch {
      // Skip individual failures without aborting the worker batch.
    }
  }
  return { queued: queuedIds.length };
}
