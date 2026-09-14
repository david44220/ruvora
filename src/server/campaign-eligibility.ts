import type { User, Campaign } from "@prisma/client";

export function campaignRegionAllowed(
  user: Pick<User, "country">,
  campaign: Pick<Campaign, "allowedCountries">,
) {
  return (
    campaign.allowedCountries.length === 0 ||
    Boolean(user.country && campaign.allowedCountries.includes(user.country))
  );
}
export function canCreatorPromote(
  user: Pick<User, "roles" | "followers" | "category" | "country" | "suspended" | "economicHold">,
  campaign: Pick<Campaign, "allowedCountries" | "creatorCategories" | "minimumCreatorFollowers">,
) {
  return (
    user.roles.includes("CREATOR") &&
    !user.suspended &&
    !user.economicHold &&
    campaignRegionAllowed(user, campaign) &&
    user.followers >= campaign.minimumCreatorFollowers &&
    (campaign.creatorCategories.length === 0 ||
      campaign.creatorCategories.some(
        (category) => category.toLowerCase() === user.category.toLowerCase(),
      ))
  );
}
