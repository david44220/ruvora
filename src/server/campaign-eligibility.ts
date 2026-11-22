import type { User, Campaign } from "@prisma/client";

function extractSocialPlatforms(socialLinks: unknown): string[] {
  if (!Array.isArray(socialLinks)) return [];
  const platforms: string[] = [];
  for (const row of socialLinks) {
    if (row && typeof row === "object" && "platform" in row && typeof row.platform === "string") {
      platforms.push(row.platform.trim().toLowerCase());
    }
  }
  return platforms;
}

export function campaignRegionAllowed(
  user: Pick<User, "country"> & Partial<Pick<User, "city" | "preferredLanguages">>,
  campaign: Pick<Campaign, "allowedCountries"> &
    Partial<Pick<Campaign, "allowedCities" | "allowedLanguages">>,
) {
  const countryOk =
    campaign.allowedCountries.length === 0 ||
    Boolean(user.country && campaign.allowedCountries.includes(user.country));
  if (!countryOk) return false;

  const allowedCities = campaign.allowedCities ?? [];
  if (allowedCities.length > 0) {
    const userCity = user.city?.trim().toLowerCase();
    if (!userCity || !allowedCities.some((c) => c.trim().toLowerCase() === userCity)) {
      return false;
    }
  }

  const allowedLanguages = campaign.allowedLanguages ?? [];
  if (allowedLanguages.length > 0) {
    const userLangs = (user.preferredLanguages ?? []).map((l) => l.toLowerCase());
    if (!allowedLanguages.some((lang) => userLangs.includes(lang.toLowerCase()))) {
      return false;
    }
  }

  return true;
}

export function canCreatorPromote(
  user: Pick<User, "roles" | "followers" | "category" | "country" | "suspended" | "economicHold"> &
    Partial<Pick<User, "city" | "preferredLanguages" | "socialLinks" | "audienceStatus">>,
  campaign: Pick<Campaign, "allowedCountries" | "creatorCategories" | "minimumCreatorFollowers"> &
    Partial<
      Pick<
        Campaign,
        | "allowedCities"
        | "allowedLanguages"
        | "allowedPlatforms"
        | "maximumCreatorFollowers"
        | "requireVerifiedAudience"
        | "minimumReliabilityScore"
      >
    >,
  reliabilityScore?: number,
) {
  if (!user.roles.includes("CREATOR") || user.suspended || user.economicHold) return false;
  if (!campaignRegionAllowed(user, campaign)) return false;
  if (user.followers < campaign.minimumCreatorFollowers) return false;
  if (
    campaign.maximumCreatorFollowers !== null &&
    campaign.maximumCreatorFollowers !== undefined &&
    user.followers > campaign.maximumCreatorFollowers
  ) {
    return false;
  }
  if (
    campaign.creatorCategories.length > 0 &&
    !campaign.creatorCategories.some(
      (category) => category.toLowerCase() === user.category.toLowerCase(),
    )
  ) {
    return false;
  }
  const allowedPlatforms = campaign.allowedPlatforms ?? [];
  if (allowedPlatforms.length > 0) {
    const userPlatforms = extractSocialPlatforms(user.socialLinks);
    if (!allowedPlatforms.some((p) => userPlatforms.includes(p.trim().toLowerCase()))) {
      return false;
    }
  }
  if (campaign.requireVerifiedAudience && user.audienceStatus !== "VERIFIED") {
    return false;
  }
  const minScore = campaign.minimumReliabilityScore ?? 0;
  if (minScore > 0 && reliabilityScore !== undefined && reliabilityScore < minScore) {
    return false;
  }
  return true;
}

/** Computes a deterministic relevance score (0-100) for smart opportunity discovery sorting. */
export function campaignRelevanceScore(
  user:
    | (Pick<User, "country" | "category" | "followers"> &
        Partial<Pick<User, "city" | "preferredLanguages" | "socialLinks" | "audienceStatus">>)
    | null
    | undefined,
  campaign: Pick<
    Campaign,
    | "allowedCountries"
    | "creatorCategories"
    | "minimumCreatorFollowers"
    | "allowedCities"
    | "allowedLanguages"
    | "allowedPlatforms"
    | "deliveryMode"
  >,
): number {
  if (!user) return 50;
  let score = 40;
  if (
    campaign.creatorCategories.length > 0 &&
    campaign.creatorCategories.some((c) => c.toLowerCase() === user.category.toLowerCase())
  ) {
    score += 25;
  }
  if (user.country && campaign.allowedCountries.includes(user.country)) {
    score += 10;
  }
  if (
    user.city &&
    campaign.allowedCities.some((c) => c.toLowerCase() === user.city!.trim().toLowerCase())
  ) {
    score += 10;
  }
  const userPlatforms = extractSocialPlatforms(user.socialLinks);
  if (
    campaign.allowedPlatforms.length > 0 &&
    campaign.allowedPlatforms.some((p) => userPlatforms.includes(p.toLowerCase()))
  ) {
    score += 10;
  }
  const userLangs = (user.preferredLanguages ?? []).map((l) => l.toLowerCase());
  if (
    campaign.allowedLanguages.length > 0 &&
    campaign.allowedLanguages.some((l) => userLangs.includes(l.toLowerCase()))
  ) {
    score += 5;
  }
  return Math.min(100, score);
}
