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
  audienceStatus: string;
}
export interface Campaign {
  canParticipate?: boolean;
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
