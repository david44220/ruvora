export type Role = "USER" | "CREATOR" | "ADVERTISER" | "ADMIN";
export type ProfileTheme = "obsidian" | "champagne" | "emerald-dusk" | "amber-glow";
export interface CreativeBrief {
  headline?: string;
  talkingPoints?: string[];
  hashtags?: string[];
  cta?: string;
  formatHint?: string;
  disclosureNote?: string;
  suggestedHooks?: string[];
  assetUrls?: string[];
}
export interface AbVariant {
  id: string;
  label: string;
  destinationUrl: string;
  weight?: number;
}
export interface CustomLink {
  id?: string;
  title: string;
  url: string;
  pinned?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  clicks?: number;
}
export interface SmartRouting {
  iosUrl?: string;
  androidUrl?: string;
  localeUrls?: Partial<Record<"fr" | "en" | "es" | "de" | "it" | "pt", string>>;
}
export interface User {
  id: string;
  email: string;
  displayName: string;
  handle: string | null;
  roles: Role[];
  locale: "en" | "fr";
  onboarded: boolean;
  country: string | null;
  city?: string | null;
  preferredLanguages?: string[];
  autoMonetize?: boolean;
  directoryOptIn?: boolean;
  kycStatus?: string;
  billingEntityName?: string | null;
  vatNumber?: string | null;
  profileTheme?: ProfileTheme;
  bio: string | null;
  category: string | null;
  followers: number;
  socialLinks: { platform: string; url: string; followers: number }[];
  customLinks: CustomLink[];
  isDemo: boolean;
  economicHold: boolean;
  suspended?: boolean;
  emailVerifiedAt?: string | null;
  mfaEnabledAt?: string | null;
  profileModules?: ProfileModule[];
  audienceStatus: string;
  audienceVerifyCode?: string | null;
  audienceVerifiedAt?: string | null;
  audienceVerifiedPlatform?: string | null;
  audienceVerifiedSource?: string | null;
}
export interface Campaign {
  canParticipate?: boolean;
  description?: string;
  allowedCountries?: string[];
  allowedCities?: string[];
  allowedLanguages?: string[];
  allowedPlatforms?: string[];
  creatorCategories?: string[];
  minimumCreatorFollowers?: number;
  maximumCreatorFollowers?: number | null;
  requireVerifiedAudience?: boolean;
  minimumReliabilityScore?: number;
  deliveryMode?: "OPEN" | "UGC_BRIEF";
  creativeBrief?: CreativeBrief | null;
  abVariants?: AbVariant[] | null;
  smartRouting?: SmartRouting | null;
  resolvedDestinationUrl?: string;
  resolvedRouteTarget?: string;
  maxActivitiesPerCreator?: number | null;
  isTemplate?: boolean;
  budgetRemainingPct?: number;
  relevanceScore?: number;
  creatorPromoCode?: { code: string; discountLabel: string; usesCount: number } | null;
  id: string;
  name: string;
  objective: string;
  destinationUrl: string;
  budgetMinor: string;
  dailyBudgetMinor: string;
  unitCostMinor: string;
  state: string;
  startAt: string;
  endAt: string;
  eventId: string | null;
  advertiserId: string;
  remainingMinor?: string;
  validatedCount?: number;
  isDemo: boolean;
  advertiser?: { displayName: string };
}
export interface Activity {
  id: string;
  type: string;
  state: string;
  createdAt: string;
  validatedAt?: string | null;
  riskScore?: number;
  riskSignals?: string[] | null;
  abVariantId?: string | null;
  promoCodeUsed?: string | null;
  providerConversions?: { decision: string; provider: string }[];
  campaign: { name: string };
  user?: { displayName: string; handle?: string | null };
  ruleVersionId?: string;
}
export interface RuvoraEvent {
  localizedContent?: {
    en: { title: string; description: string; rules: string };
    fr: { title: string; description: string; rules: string };
  };
  configuration?: {
    milestones?: { points: number; title: { en: string; fr: string } }[];
    rewardTiers?: { fromRank: number; toRank: number; shareBps: number }[];
  };
  configVersion?: string;
  sponsor?: string | null;
  rules?: string | Record<string, string> | null;
  prizeBudgetMinor?: string;
  fundedMinor?: string;
  fundingState?: string;
  settlement?: { id: string; state: string; finalizedAt: string } | null;
  id: string;
  slug: string;
  title: string;
  description: string;
  state: string;
  startAt: string;
  endAt: string;
  isDemo: boolean;
  _count?: { memberships: number };
  participantCount?: number;
  campaigns?: Campaign[];
}
export interface Transaction {
  id: string;
  amountMinor: string;
  createdAt: string;
  transaction: {
    id: string;
    description?: string;
    kind?: string;
    reference?: string;
    isDemo: boolean;
  };
}
export interface ReliabilitySummary {
  reliabilityScore: number;
  tier: "EXPLORER" | "TRUSTED" | "AMBASSADOR";
  validatedCount: number;
  rejectedCount: number;
  reversedCount: number;
}
export interface Dashboard {
  user: User;
  isDemo: boolean;
  summary: {
    moneyMinor: string;
    currency: string;
    ruMicros: string;
    xp: number;
    level: number;
    eventPoints: number;
    validatedActivities: number;
    pendingActivities: number;
    referrals: number;
  };
  reliability?: ReliabilitySummary;
  unreadNotifications?: number;
  walletMeta?: {
    microPayoutThresholdMinor: string;
    payoutsConnected: boolean;
    lastDistributionAt: string | null;
  };
  rewardUnits: { state: string; category: string; _sum: { amountMicros: string } }[];
  activities: Activity[];
  campaigns: Campaign[];
  events: RuvoraEvent[];
  transactions: Transaction[];
  eligibility: { followerThreshold: number; creatorEligible: boolean; audienceStatus?: string };
  fundingEnabled: boolean;
}
export interface EventDetail {
  personalPrizeMinor?: string | null;
  event: RuvoraEvent;
  leaderboard: {
    userId: string;
    displayName: string;
    handle: string;
    points: number;
    rank: number;
  }[];
  joined: boolean;
  personal: { points: number; rank?: number } | null;
}

export type ProfileModuleType = "OPPORTUNITY" | "EVENT" | "REFERRAL" | "LINKS" | "SOCIALS";
export interface ProfileModule {
  type: ProfileModuleType;
  visible: boolean;
}
