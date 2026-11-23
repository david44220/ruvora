import { z } from "zod";
import { db } from "./db";
import { isDevelopment } from "./environment";
import { activeRules } from "./rules";
import { normalizeSmartRouting } from "../lib/smart-routing";

const exploreQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  objective: z
    .enum(["CLICK", "QUALIFIED_VIEW", "CONVERSION", "SPONSORED_MISSION", "CREATOR_PROMOTION"])
    .optional(),
  platform: z.string().trim().max(30).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  category: z.string().trim().max(40).optional(),
});

export type ExploreFilters = z.infer<typeof exploreQuerySchema>;

export interface PublicExploreCampaign {
  id: string;
  name: string;
  description: string;
  objective: string;
  deliveryMode: string;
  allowedCountries: string[];
  allowedCities: string[];
  allowedPlatforms: string[];
  creatorCategories: string[];
  minimumCreatorFollowers: number;
  maximumCreatorFollowers: number | null;
  hasBrief: boolean;
  hasSmartRouting: boolean;
  budgetRemainingPct: number;
  advertiserName: string;
  endAt: string;
  isDemo: boolean;
}

export interface PublicExploreCreator {
  handle: string;
  displayName: string;
  bio: string;
  category: string;
  city: string | null;
  country: string | null;
  followers: number;
  audienceStatus: string;
  audienceVerifiedPlatform: string | null;
  profileTheme: string;
  socialPlatforms: string[];
  showcaseCount: number;
  isDemo: boolean;
}

export interface ExploreMarketplaceData {
  campaigns: PublicExploreCampaign[];
  creators: PublicExploreCreator[];
  policy: {
    ruleVersion: string;
    followerThreshold: number;
    rates: Record<
      string,
      {
        creatorRuMicros: string;
        userRuMicros: string;
        xp: number;
      }
    >;
  };
  development: boolean;
}

export async function getExploreMarketplace(
  rawFilters: Record<string, string | undefined> = {},
): Promise<ExploreMarketplaceData> {
  const cleaned = Object.fromEntries(
    Object.entries(rawFilters).filter(([, v]) => typeof v === "string" && v.trim() !== ""),
  );
  const parsed = exploreQuerySchema.safeParse(cleaned);
  const filters: ExploreFilters = parsed.success ? parsed.data : {};
  const now = new Date();
  const dev = isDevelopment();

  const [{ record, config }, rawCampaigns, rawCreators] = await Promise.all([
    activeRules(db),
    db.campaign.findMany({
      where: {
        state: "ACTIVE",
        startAt: { lte: now },
        endAt: { gt: now },
        ...(dev ? {} : { isDemo: false }),
        ...(filters.objective ? { objective: filters.objective } : {}),
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: "insensitive" } },
                { description: { contains: filters.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        advertiser: { select: { displayName: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 48,
    }),
    db.user.findMany({
      where: {
        suspended: false,
        economicHold: false,
        directoryOptIn: true,
        handle: { not: null },
        roles: { has: "CREATOR" },
        ...(dev ? {} : { isDemo: false }),
        ...(filters.country ? { country: filters.country } : {}),
        ...(filters.q
          ? {
              OR: [
                { displayName: { contains: filters.q, mode: "insensitive" } },
                { handle: { contains: filters.q, mode: "insensitive" } },
                { bio: { contains: filters.q, mode: "insensitive" } },
                { category: { contains: filters.q, mode: "insensitive" } },
                { city: { contains: filters.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        handle: true,
        displayName: true,
        bio: true,
        category: true,
        city: true,
        country: true,
        followers: true,
        audienceStatus: true,
        audienceVerifiedPlatform: true,
        profileTheme: true,
        socialLinks: true,
        isDemo: true,
        _count: { select: { showcaseItems: { where: { pinned: true } } } },
      },
      orderBy: [{ audienceStatus: "asc" }, { followers: "desc" }],
      take: 36,
    }),
  ]);

  const campaignIds = rawCampaigns.map((c) => c.id);
  const escrowAccountIds = campaignIds.map((id) => `campaign:${id}`);
  const escrowSums = escrowAccountIds.length
    ? await db.ledgerEntry.groupBy({
        by: ["accountId"],
        where: { accountId: { in: escrowAccountIds } },
        _sum: { amountMinor: true },
      })
    : [];
  const balanceByAccount = new Map(
    escrowSums.map((row) => [row.accountId, row._sum.amountMinor ?? 0n]),
  );

  const qLower = filters.q?.toLowerCase();
  const catLower = filters.category?.toLowerCase();
  const platLower = filters.platform?.toLowerCase();

  const campaigns: PublicExploreCampaign[] = [];
  for (const c of rawCampaigns) {
    const remaining = balanceByAccount.get(`campaign:${c.id}`) ?? 0n;
    if (remaining < c.unitCostMinor) continue;
    if (filters.country && c.allowedCountries.length > 0) {
      if (!c.allowedCountries.includes(filters.country)) continue;
    }
    if (platLower && c.allowedPlatforms.length > 0) {
      if (!c.allowedPlatforms.some((p) => p.toLowerCase() === platLower)) continue;
    }
    if (catLower && c.creatorCategories.length > 0) {
      if (!c.creatorCategories.some((cat) => cat.toLowerCase().includes(catLower))) continue;
    }
    const briefObj = c.creativeBrief as Record<string, unknown> | null;
    const hasBrief = Boolean(
      briefObj &&
      (briefObj.headline ||
        (Array.isArray(briefObj.talkingPoints) && briefObj.talkingPoints.length > 0) ||
        briefObj.cta),
    );
    const pct =
      c.budgetMinor > 0n
        ? Math.max(0, Math.min(100, Number((remaining * 100n) / c.budgetMinor)))
        : 0;
    campaigns.push({
      id: c.id,
      name: c.name,
      description: c.description,
      objective: c.objective,
      deliveryMode: c.deliveryMode,
      allowedCountries: c.allowedCountries,
      allowedCities: c.allowedCities,
      allowedPlatforms: c.allowedPlatforms,
      creatorCategories: c.creatorCategories,
      minimumCreatorFollowers: c.minimumCreatorFollowers,
      maximumCreatorFollowers: c.maximumCreatorFollowers,
      hasBrief,
      hasSmartRouting: Boolean(normalizeSmartRouting(c.smartRouting)),
      budgetRemainingPct: pct,
      advertiserName: c.advertiser.displayName,
      endAt: c.endAt.toISOString(),
      isDemo: c.isDemo,
    });
  }

  const creators: PublicExploreCreator[] = [];
  for (const u of rawCreators) {
    if (!u.handle) continue;
    const socials = Array.isArray(u.socialLinks)
      ? (u.socialLinks as { platform?: string }[])
          .map((s) => (typeof s?.platform === "string" ? s.platform.trim() : ""))
          .filter(Boolean)
      : [];
    if (platLower && !socials.some((p) => p.toLowerCase() === platLower)) continue;
    if (catLower && !u.category.toLowerCase().includes(catLower)) continue;
    if (
      qLower &&
      !u.displayName.toLowerCase().includes(qLower) &&
      !u.handle.toLowerCase().includes(qLower) &&
      !u.category.toLowerCase().includes(qLower) &&
      !(u.city ?? "").toLowerCase().includes(qLower) &&
      !u.bio.toLowerCase().includes(qLower)
    ) {
      continue;
    }
    creators.push({
      handle: u.handle,
      displayName: u.displayName,
      bio: u.bio,
      category: u.category,
      city: u.city,
      country: u.country,
      followers: u.followers,
      audienceStatus: u.audienceStatus,
      audienceVerifiedPlatform: u.audienceVerifiedPlatform,
      profileTheme: u.profileTheme,
      socialPlatforms: [...new Set(socials)],
      showcaseCount: u._count.showcaseItems,
      isDemo: u.isDemo,
    });
  }

  const rates: ExploreMarketplaceData["policy"]["rates"] = {};
  for (const [obj, rate] of Object.entries(config.reward.rates)) {
    if (!rate) continue;
    rates[obj] = {
      creatorRuMicros: rate.creatorRuMicros.toString(),
      userRuMicros: rate.userRuMicros.toString(),
      xp: rate.xp,
    };
  }

  return {
    campaigns,
    creators,
    policy: {
      ruleVersion: record.version,
      followerThreshold: config.creatorFollowerThreshold,
      rates,
    },
    development: dev,
  };
}
