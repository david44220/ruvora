export type Role = "USER" | "CREATOR" | "ADVERTISER" | "ADMIN";
export interface User {
  id: string;
  email: string;
  displayName: string;
  handle: string | null;
  roles: Role[];
  locale: "en" | "fr";
  onboarded: boolean;
  country: string | null;
  bio: string | null;
  category: string | null;
  followers: number;
  socialLinks: { platform: string; url: string; followers: number }[];
  customLinks: { title: string; url: string }[];
  isDemo: boolean;
  economicHold: boolean;
  emailVerifiedAt?: string | null;
  mfaEnabledAt?: string | null;
  profileModules?: ProfileModule[];
  audienceStatus: string;
}
export interface Campaign {
  canParticipate?: boolean;
  description?: string;
  allowedCountries?: string[];
  creatorCategories?: string[];
  minimumCreatorFollowers?: number;
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
  campaign: { name: string };
  user?: { displayName: string };
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
  rules?: string;
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
  rewardUnits: { state: string; category: string; _sum: { amountMicros: string } }[];
  activities: Activity[];
  campaigns: Campaign[];
  events: RuvoraEvent[];
  transactions: Transaction[];
  eligibility: { followerThreshold: number; creatorEligible: boolean };
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
