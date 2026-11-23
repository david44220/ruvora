import { randomBytes } from "node:crypto";
import { z } from "zod";
import { evaluatePersistedPolicy } from "../domains/policy";
import type { User } from "@prisma/client";
import { atomic, db, jsonValue, type Tx } from "./db";
import { AppError, assert } from "./errors";
import { activeRules } from "./rules";
import { isDevelopment } from "./environment";
import { publicUser } from "./auth";
import {
  getProfileEntry,
  getCreatorCampaignEntry,
  getCreatorEventEntry,
  getReferralEntry,
} from "./attribution";
import { publicEvent } from "./events";
import { listCampaigns } from "./campaigns";
import { safeUrl } from "./validation";
export { safeUrl } from "./validation";

const optionalIsoDate = z
  .union([z.iso.datetime(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const customLinkSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]{3,40}$/)
      .optional(),
    title: z.string().trim().min(1).max(50),
    url: safeUrl,
    pinned: z.boolean().optional().default(false),
    startsAt: optionalIsoDate,
    endsAt: optionalIsoDate,
  })
  .strict()
  .refine(
    (link) =>
      !link.startsAt ||
      !link.endsAt ||
      new Date(link.startsAt).getTime() < new Date(link.endsAt).getTime(),
    "Link end time must be after start time.",
  );

const profileSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,24}$/)
      .refine(
        (v) =>
          ![
            "admin",
            "api",
            "app",
            "billing",
            "events",
            "explore",
            "forgot_password",
            "help",
            "login",
            "moderator",
            "offers",
            "official",
            "onboarding",
            "privacy",
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
          ].includes(v),
        "This handle is reserved.",
      ),
    displayName: z.string().trim().min(2).max(60),
    bio: z.string().trim().max(300).default(""),
    category: z.string().trim().max(40).default("Creator"),
    locale: z.enum(["en", "fr"]).default("en"),
    country: z.string().regex(/^[A-Z]{2}$/),
    city: z.string().trim().max(60).optional(),
    preferredLanguages: z
      .array(z.enum(["fr", "en", "es", "de", "it", "pt"]))
      .max(6)
      .optional(),
    autoMonetize: z.boolean().optional(),
    directoryOptIn: z.boolean().optional(),
    leaderboardOptIn: z.boolean().optional(),
    billingEntityName: z.string().trim().max(120).optional(),
    vatNumber: z.string().trim().max(40).optional(),
    profileTheme: z.enum(["obsidian", "champagne", "emerald-dusk", "amber-glow"]).optional(),
    ageEligible: z.literal(true),
    termsAccepted: z.literal(true),
    roles: z
      .array(z.enum(["USER", "CREATOR", "ADVERTISER"]))
      .max(3)
      .optional(),
    socials: z
      .array(
        z
          .object({
            platform: z.string().trim().min(2).max(30),
            url: safeUrl,
            followers: z.number().int().min(0).max(1000000000),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    links: z.array(customLinkSchema).max(12).default([]),
  })
  .strict();
export async function saveProfile(user: User, input: unknown) {
  const value = profileSchema.parse(input);
  return atomic(async (tx) => {
    const conflict = await tx.user.findUnique({ where: { handle: value.handle } });
    assert(
      !conflict || conflict.id === user.id,
      "HANDLE_UNAVAILABLE",
      "This handle is already in use.",
      409,
    );
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const roles = [...new Set([...current.roles, ...(value.roles ?? []), "USER" as const])];
    const nextFollowers = Math.max(0, ...value.socials.map((social) => social.followers));
    const keepVerified =
      current.audienceStatus === "VERIFIED" &&
      nextFollowers <= current.followers &&
      nextFollowers >= 10;
    const normalizedLinks = value.links.map((link) => {
      const hasMeta = Boolean(link.id || link.pinned || link.startsAt || link.endsAt);
      return {
        ...(hasMeta ? { id: link.id || `lnk_${randomBytes(5).toString("hex")}` } : {}),
        title: link.title,
        url: link.url,
        ...(link.pinned ? { pinned: true } : {}),
        ...(link.startsAt ? { startsAt: link.startsAt } : {}),
        ...(link.endsAt ? { endsAt: link.endsAt } : {}),
      };
    });
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        handle: value.handle,
        displayName: value.displayName,
        bio: value.bio,
        category: value.category,
        locale: value.locale,
        country: value.country,
        ...(value.city !== undefined ? { city: value.city || null } : {}),
        ...(value.preferredLanguages !== undefined
          ? { preferredLanguages: value.preferredLanguages }
          : {}),
        ...(value.autoMonetize !== undefined ? { autoMonetize: value.autoMonetize } : {}),
        ...(value.directoryOptIn !== undefined ? { directoryOptIn: value.directoryOptIn } : {}),
        ...(value.leaderboardOptIn !== undefined
          ? { leaderboardOptIn: value.leaderboardOptIn }
          : {}),
        ...(value.billingEntityName !== undefined
          ? { billingEntityName: value.billingEntityName || null }
          : {}),
        ...(value.vatNumber !== undefined ? { vatNumber: value.vatNumber || null } : {}),
        ...(value.profileTheme !== undefined ? { profileTheme: value.profileTheme } : {}),
        ageEligible: true,
        termsAcceptedAt: current.termsAcceptedAt ?? new Date(),
        onboarded: true,
        roles,
        socialLinks: jsonValue(value.socials),
        customLinks: jsonValue(normalizedLinks),
        followers: nextFollowers,
        audienceStatus: keepVerified ? "VERIFIED" : "SELF_DECLARED",
      },
    });
    return { user: publicUser(updated) };
  });
}
export async function assertEligible(tx: Tx, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const { config } = await activeRules(tx);
  assert(
    !user.suspended && !user.economicHold,
    "ECONOMIC_HOLD",
    "This account requires an eligibility review.",
    403,
  );
  assert(
    evaluatePersistedPolicy(user, "PARTICIPATION", config).eligible,
    "POLICY_INELIGIBLE",
    "Complete onboarding and check regional availability before participating.",
    403,
  );
  assert(
    isDevelopment() || !user.isDemo,
    "DEMO_PRODUCTION_BLOCKED",
    "Development accounts cannot perform production economic operations.",
    403,
  );
  return user;
}
export async function getPublicProfile(handle: string) {
  const user = await db.user.findUnique({
    where: { handle },
    select: {
      id: true,
      displayName: true,
      handle: true,
      bio: true,
      category: true,
      city: true,
      profileTheme: true,
      autoMonetize: true,
      socialLinks: true,
      customLinks: true,
      followers: true,
      audienceStatus: true,
      audienceVerifiedPlatform: true,
      audienceVerifiedAt: true,
      profileModules: true,
      isDemo: true,
      suspended: true,
      roles: true,
      createdAt: true,
    },
  });
  assert(
    user && !user.suspended && (isDevelopment() || !user.isDemo),
    "PROFILE_NOT_FOUND",
    "This profile is not available.",
    404,
  );
  let entry: { slug: string; url: string } | null = null;
  let referralEntry: { slug: string; url: string } | null = null;
  const opportunities: {
    id: string;
    name: string;
    description: string;
    objective: string;
    isDemo: boolean;
    url: string;
    promoCode?: string | null;
    discountLabel?: string | null;
  }[] = [];
  const showcase: {
    id: string;
    campaignId: string;
    collectionName: string;
    creatorNote: string;
    name: string;
    description: string;
    objective: string;
    disclosureNote: string;
    isDemo: boolean;
    url: string;
    promoCode?: string | null;
    discountLabel?: string | null;
  }[] = [];
  const trackedEvents: Record<string, string> = {};
  try {
    entry = await getProfileEntry(handle);
    const activePromoCodes = await db.promoCode.findMany({
      where: { creatorId: user.id, active: true },
      select: { campaignId: true, code: true, discountLabel: true },
    });
    const promoByCampaign = new Map(activePromoCodes.map((p) => [p.campaignId, p]));

    const pinnedShowcase = await db.creatorShowcaseItem.findMany({
      where: {
        creatorId: user.id,
        pinned: true,
        campaign: {
          state: "ACTIVE",
          ...(isDevelopment() ? {} : { isDemo: false }),
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 6,
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
            objective: true,
            isDemo: true,
            creativeBrief: true,
          },
        },
      },
    });
    for (const item of pinnedShowcase) {
      try {
        const link = await getCreatorCampaignEntry(handle, item.campaign.id);
        const promo = promoByCampaign.get(item.campaign.id);
        const brief = item.campaign.creativeBrief as { disclosureNote?: string } | null;
        showcase.push({
          id: item.id,
          campaignId: item.campaign.id,
          collectionName: item.collectionName,
          creatorNote: item.creatorNote,
          name: item.campaign.name,
          description: item.campaign.description,
          objective: item.campaign.objective,
          disclosureNote: brief?.disclosureNote ?? "",
          isDemo: item.campaign.isDemo,
          url: link.url,
          promoCode: promo?.code ?? null,
          discountLabel: promo?.discountLabel ?? null,
        });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
      }
    }

    if (user.autoMonetize) {
      const creator = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      const available = await listCampaigns(creator, { forCreator: true });
      for (const campaign of available.campaigns.filter((c) => c.canParticipate).slice(0, 3)) {
        try {
          const link = await getCreatorCampaignEntry(handle, campaign.id);
          const promo = promoByCampaign.get(campaign.id);
          opportunities.push({
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            objective: campaign.objective,
            isDemo: campaign.isDemo,
            url: link.url,
            promoCode: promo?.code ?? null,
            discountLabel: promo?.discountLabel ?? null,
          });
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
        }
      }
    }
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
  try {
    referralEntry = await getReferralEntry(handle);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
  const events = await db.event.findMany({
    where: {
      state: "ACTIVE",
      visibility: "PUBLIC",
      ...(isDevelopment() ? {} : { isDemo: false }),
      memberships: { some: { userId: user.id } },
    },
    take: 4,
  });
  if (entry)
    for (const event of events) {
      try {
        trackedEvents[event.id] = (await getCreatorEventEntry(handle, event.id)).url;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
      }
    }
  const nowMs = Date.now();
  const rawLinks = Array.isArray(user.customLinks)
    ? (user.customLinks as {
        id?: string;
        title?: string;
        url?: string;
        pinned?: boolean;
        startsAt?: string | null;
        endsAt?: string | null;
      }[])
    : [];
  const activeCustomLinks = rawLinks
    .map((link, index) => ({
      id: typeof link.id === "string" && link.id ? link.id : `legacy_${index}`,
      title: typeof link.title === "string" ? link.title : "",
      url: typeof link.url === "string" ? link.url : "",
      pinned: Boolean(link.pinned),
      startsAt: typeof link.startsAt === "string" && link.startsAt ? link.startsAt : null,
      endsAt: typeof link.endsAt === "string" && link.endsAt ? link.endsAt : null,
    }))
    .filter((link) => {
      if (!link.title || !link.url) return false;
      if (link.startsAt && new Date(link.startsAt).getTime() > nowMs) return false;
      if (link.endsAt && new Date(link.endsAt).getTime() < nowMs) return false;
      return true;
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const { getCreatorRetentionSummary } = await import("./retention");
  const retention = await getCreatorRetentionSummary(user.id);

  return {
    entry,
    referralEntry,
    opportunities,
    showcase,
    trackedEvents,
    profile: {
      ...user,
      customLinks: activeCustomLinks,
      xp: retention.totalXp,
      level: retention.level,
      streakWeeks: retention.streak.currentStreakWeeks,
      badges: retention.badges,
    },
    events: events.map(publicEvent),
    campaigns: await db.campaign.findMany({
      where: { state: "ACTIVE", advertiserId: user.id },
      take: 4,
      select: {
        id: true,
        name: true,
        description: true,
        objective: true,
        destinationUrl: true,
        endAt: true,
        isDemo: true,
      },
    }),
  };
}

const linkClickSchema = z
  .object({
    linkId: z.string().trim().min(1).max(60),
  })
  .strict();

/**
 * Strictly telemetry-only personal bio-link click counter.
 * Creates ZERO Money, ZERO Reward Units, ZERO XP, and ZERO Event Points.
 */
export async function recordProfileLinkClick(handle: string, input: unknown) {
  const normalized = handle.trim().toLowerCase().replace(/^@/, "");
  const { linkId } = linkClickSchema.parse(input);
  const user = await db.user.findUnique({
    where: { handle: normalized },
    select: { id: true, suspended: true, isDemo: true, customLinks: true },
  });
  assert(
    user && !user.suspended && (isDevelopment() || !user.isDemo),
    "PROFILE_NOT_FOUND",
    "This profile is not available.",
    404,
  );
  const rawLinks = Array.isArray(user.customLinks) ? (user.customLinks as { id?: string }[]) : [];
  const validIds = new Set(
    rawLinks.map((l, idx) => (typeof l?.id === "string" && l.id ? l.id : `legacy_${idx}`)),
  );
  assert(validIds.has(linkId), "LINK_NOT_FOUND", "Custom link not found.", 404);
  await db.profileLinkClick.create({
    data: {
      userId: user.id,
      linkId,
      isDemo: user.isDemo,
    },
  });
  return { recorded: true, linkId, economicEffect: "NONE" as const };
}

export async function getCreatorLinkClickStats(user: User) {
  const grouped = await db.profileLinkClick.groupBy({
    by: ["linkId"],
    where: { userId: user.id },
    _count: { _all: true },
  });
  const byLinkId: Record<string, number> = {};
  let totalClicks = 0;
  for (const row of grouped) {
    byLinkId[row.linkId] = row._count._all;
    totalClicks += row._count._all;
  }
  return { totalClicks, byLinkId };
}

export async function saveProfileModules(user: User, input: unknown) {
  const modules = z
    .object({
      modules: z
        .array(
          z
            .object({
              type: z.enum(["OPPORTUNITY", "EVENT", "REFERRAL", "LINKS", "SOCIALS"]),
              visible: z.boolean(),
            })
            .strict(),
        )
        .length(5)
        .refine(
          (rows) => new Set(rows.map((row) => row.type)).size === 5,
          "Each supported section must appear once.",
        ),
    })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { profileModules: jsonValue(modules.modules) },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "PROFILE_MODULES_UPDATED",
        targetId: user.id,
        details: jsonValue(modules),
      },
    });
    return { user: publicUser(updated) };
  });
}
