import { db } from "./db";
import { assert } from "./errors";
import { isDevelopment } from "./environment";
import { activeRules } from "./rules";
import { normalizeSmartRouting, resolveSmartDestination } from "../lib/smart-routing";
import { isShareSlug } from "../lib/share-recovery";

export interface PublicCreativeBrief {
  headline: string;
  talkingPoints: string[];
  hashtags: string[];
  cta: string;
  formatHint: string;
  disclosureNote: string;
  suggestedHooks: string[];
  assetUrls: string[];
  dos: string[];
  donts: string[];
  brandTone: string;
  colorPalette: string[];
}

export function normalizeCreativeBrief(raw: unknown): PublicCreativeBrief | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim())
      : [];
  const brief: PublicCreativeBrief = {
    headline: str(obj.headline),
    talkingPoints: arr(obj.talkingPoints),
    hashtags: arr(obj.hashtags),
    cta: str(obj.cta),
    formatHint: str(obj.formatHint),
    disclosureNote: str(obj.disclosureNote),
    suggestedHooks: arr(obj.suggestedHooks),
    assetUrls: arr(obj.assetUrls),
    dos: arr(obj.dos),
    donts: arr(obj.donts),
    brandTone: str(obj.brandTone),
    colorPalette: arr(obj.colorPalette).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)),
  };
  const hasAny = Boolean(
    brief.headline ||
    brief.talkingPoints.length ||
    brief.hashtags.length ||
    brief.cta ||
    brief.disclosureNote ||
    brief.suggestedHooks.length ||
    brief.assetUrls.length ||
    brief.dos.length ||
    brief.donts.length ||
    brief.brandTone ||
    brief.colorPalette.length,
  );
  return hasAny ? brief : null;
}

export interface PublicCampaignOffer {
  id: string;
  name: string;
  description: string;
  objective: string;
  deliveryMode: string;
  allowedCountries: string[];
  allowedCities: string[];
  allowedPlatforms: string[];
  allowedLanguages: string[];
  creatorCategories: string[];
  minimumCreatorFollowers: number;
  maximumCreatorFollowers: number | null;
  requireVerifiedAudience: boolean;
  minimumReliabilityScore: number;
  creativeBrief: PublicCreativeBrief | null;
  hasSmartRouting: boolean;
  budgetRemainingPct: number;
  activePromotersCount: number;
  advertiserName: string;
  endAt: string;
  isDemo: boolean;
  policy: {
    ruleVersion: string;
    creatorRuMicros: string;
    userRuMicros: string;
    xp: number;
  };
}

/**
 * Loads a public, non-sensitive offer sheet for an active funded campaign.
 * Never exposes advertiser balances, escrow minor units, or internal review notes.
 */
export async function getPublicCampaignOffer(campaignId: string): Promise<PublicCampaignOffer> {
  const now = new Date();
  const dev = isDevelopment();
  const [campaign, rules, promoters] = await Promise.all([
    db.campaign.findUnique({
      where: { id: campaignId },
      include: {
        advertiser: { select: { displayName: true, suspended: true, economicHold: true } },
      },
    }),
    activeRules(db),
    db.shareLink.findMany({
      where: { campaignId, active: true, creatorId: { not: null } },
      select: { creatorId: true },
      distinct: ["creatorId"],
    }),
  ]);

  assert(
    campaign &&
      campaign.state === "ACTIVE" &&
      campaign.startAt <= now &&
      campaign.endAt > now &&
      !campaign.advertiser.suspended &&
      !campaign.advertiser.economicHold &&
      (dev || !campaign.isDemo),
    "CAMPAIGN_INACTIVE",
    "This campaign offer is unavailable.",
    404,
  );

  const escrowAgg = await db.ledgerEntry.aggregate({
    where: { accountId: `campaign:${campaign.id}` },
    _sum: { amountMinor: true },
  });
  const remaining = escrowAgg._sum.amountMinor ?? 0n;
  assert(
    remaining >= campaign.unitCostMinor,
    "INSUFFICIENT_FUNDS",
    "This campaign currently has no funded capacity remaining.",
    404,
  );

  const pct =
    campaign.budgetMinor > 0n
      ? Math.max(0, Math.min(100, Number((remaining * 100n) / campaign.budgetMinor)))
      : 0;
  const rate = rules.config.reward.rates[campaign.objective];

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    objective: campaign.objective,
    deliveryMode: campaign.deliveryMode,
    allowedCountries: campaign.allowedCountries,
    allowedCities: campaign.allowedCities,
    allowedPlatforms: campaign.allowedPlatforms,
    allowedLanguages: campaign.allowedLanguages,
    creatorCategories: campaign.creatorCategories,
    minimumCreatorFollowers: campaign.minimumCreatorFollowers,
    maximumCreatorFollowers: campaign.maximumCreatorFollowers,
    requireVerifiedAudience: campaign.requireVerifiedAudience,
    minimumReliabilityScore: campaign.minimumReliabilityScore,
    creativeBrief: normalizeCreativeBrief(campaign.creativeBrief),
    hasSmartRouting: Boolean(normalizeSmartRouting(campaign.smartRouting)),
    budgetRemainingPct: pct,
    activePromotersCount: promoters.length,
    advertiserName: campaign.advertiser.displayName,
    endAt: campaign.endAt.toISOString(),
    isDemo: campaign.isDemo,
    policy: {
      ruleVersion: rules.record.version,
      creatorRuMicros: (rate?.creatorRuMicros ?? 0n).toString(),
      userRuMicros: (rate?.userRuMicros ?? 0n).toString(),
      xp: rate?.xp ?? 0,
    },
  };
}

export interface MobileBridgeCardData {
  slug: string;
  campaignId: string;
  campaignName: string;
  campaignDescription: string;
  objective: string;
  headline: string;
  disclosureNote: string;
  creatorDisplayName: string;
  creatorHandle: string | null;
  creatorVerified: boolean;
  promoCode: string | null;
  discountLabel: string;
  outboundUrl: string;
  ruvoraActionPath: string;
  isDemo: boolean;
}

/**
 * Loads server-authoritative data for the 1-tap Mobile Offer Bridge Card (/go-card/[slug]).
 * Destinations are strictly resolved from the persisted campaign and Smart Routing rules,
 * never from untrusted query parameters.
 */
export async function getGoBridgeCard(
  slug: string,
  hints?: { userAgent?: string | null; acceptLanguage?: string | null },
): Promise<MobileBridgeCardData> {
  assert(isShareSlug(slug), "SHARE_LINK_INVALID", "This share link is invalid.", 404);
  const dev = isDevelopment();
  const now = new Date();
  const entry = await db.shareLink.findFirst({
    where: { OR: [{ slug }, { customSlug: slug }], active: true },
    include: {
      campaign: {
        include: { advertiser: { select: { suspended: true, economicHold: true } } },
      },
      creator: {
        select: {
          id: true,
          displayName: true,
          handle: true,
          audienceStatus: true,
          suspended: true,
          economicHold: true,
        },
      },
      owner: {
        select: {
          id: true,
          displayName: true,
          handle: true,
          audienceStatus: true,
          suspended: true,
          economicHold: true,
          isDemo: true,
        },
      },
    },
  });

  assert(
    entry &&
      entry.campaign &&
      entry.campaign.state === "ACTIVE" &&
      entry.campaign.startAt <= now &&
      entry.campaign.endAt > now &&
      !entry.owner.suspended &&
      !entry.owner.economicHold &&
      !entry.campaign.advertiser.suspended &&
      !entry.campaign.advertiser.economicHold &&
      (dev || (!entry.isDemo && !entry.campaign.isDemo && !entry.owner.isDemo)),
    "SHARE_LINK_INACTIVE",
    "This offer card is unavailable.",
    404,
  );

  const creator = entry.creator ?? entry.owner;
  const promo = await db.promoCode.findUnique({
    where: {
      creatorId_campaignId: { creatorId: creator.id, campaignId: entry.campaign.id },
    },
    select: { code: true, discountLabel: true, active: true },
  });

  const brief = normalizeCreativeBrief(entry.campaign.creativeBrief);
  const resolved = resolveSmartDestination({
    destinationUrl: entry.campaign.destinationUrl,
    smartRouting: entry.campaign.smartRouting,
    userAgent: hints?.userAgent,
    acceptLanguage: hints?.acceptLanguage,
  });

  return {
    slug: entry.customSlug || entry.slug,
    campaignId: entry.campaign.id,
    campaignName: entry.campaign.name,
    campaignDescription: entry.campaign.description,
    objective: entry.campaign.objective,
    headline: brief?.headline || entry.campaign.description || entry.campaign.name,
    disclosureNote: brief?.disclosureNote || "",
    creatorDisplayName: creator.displayName,
    creatorHandle: creator.handle,
    creatorVerified: creator.audienceStatus === "VERIFIED",
    promoCode: promo?.active ? promo.code : null,
    discountLabel: promo?.active ? promo.discountLabel : "",
    outboundUrl: resolved.url,
    ruvoraActionPath: `/app/opportunities?campaign=${encodeURIComponent(entry.campaign.id)}`,
    isDemo: entry.isDemo || entry.campaign.isDemo,
  };
}
