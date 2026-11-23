/**
 * Pure XP-only creator consistency streak & milestone badge calculators.
 * Strictly separated from Money, Reward Units (RU), and Event Points.
 */

export type CreatorBadgeCode =
  | "ACTIVE_PROMOTER"
  | "MULTI_CHANNEL_3"
  | "VERIFIED_CREATOR"
  | "CURATED_SHOWCASE"
  | "CONSISTENT_STREAK"
  | "COMMUNITY_BUILDER";

export interface CreatorBadge {
  code: CreatorBadgeCode;
  labelKey:
    | "p8BadgeActivePromoter"
    | "p8BadgeMultiChannel"
    | "p8BadgeVerifiedCreator"
    | "p8BadgeCuratedShowcase"
    | "p8BadgeConsistentStreak"
    | "p8BadgeCommunityBuilder";
}

export interface CreatorBadgeFacts {
  socialChannelsCount: number;
  audienceVerified: boolean;
  showcasePinnedCount: number;
  longestStreakWeeks: number;
  referralsCount: number;
  eventMembershipsCount: number;
  hasActiveSocialShare: boolean;
}

export interface WeeklyStreakSummary {
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  activeThisWeek: boolean;
  activeWeeksCount: number;
}

/** Returns ISO-8601 week start (Monday 00:00:00 UTC) timestamp in ms for a Date. */
export function isoWeekStartUtcMs(date: Date): number {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diffToMonday);
  return utc.getTime();
}

const WEEK_MS = 7 * 86_400_000;

/**
 * Computes consecutive active ISO weeks (Monday..Sunday UTC).
 * A streak stays alive if the creator was active either this ISO week OR last ISO week.
 */
export function computeWeeklyStreak(dates: readonly Date[], now = new Date()): WeeklyStreakSummary {
  if (dates.length === 0) {
    return {
      currentStreakWeeks: 0,
      longestStreakWeeks: 0,
      activeThisWeek: false,
      activeWeeksCount: 0,
    };
  }
  const uniqueWeeks = [...new Set(dates.map((d) => isoWeekStartUtcMs(d)))].sort((a, b) => a - b);
  const thisWeek = isoWeekStartUtcMs(now);
  const lastWeek = thisWeek - WEEK_MS;
  const activeThisWeek = uniqueWeeks.includes(thisWeek);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniqueWeeks.length; i++) {
    if (uniqueWeeks[i]! - uniqueWeeks[i - 1]! === WEEK_MS) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  let current = 0;
  let cursor = activeThisWeek ? thisWeek : uniqueWeeks.includes(lastWeek) ? lastWeek : null;
  const weekSet = new Set(uniqueWeeks);
  while (cursor !== null && weekSet.has(cursor)) {
    current++;
    cursor -= WEEK_MS;
  }

  return {
    currentStreakWeeks: current,
    longestStreakWeeks: longest,
    activeThisWeek,
    activeWeeksCount: uniqueWeeks.length,
  };
}

export function computeCreatorBadges(facts: CreatorBadgeFacts): CreatorBadge[] {
  const badges: CreatorBadge[] = [];
  if (facts.audienceVerified) {
    badges.push({ code: "VERIFIED_CREATOR", labelKey: "p8BadgeVerifiedCreator" });
  }
  if (facts.hasActiveSocialShare) {
    badges.push({ code: "ACTIVE_PROMOTER", labelKey: "p8BadgeActivePromoter" });
  }
  if (facts.socialChannelsCount >= 3) {
    badges.push({ code: "MULTI_CHANNEL_3", labelKey: "p8BadgeMultiChannel" });
  }
  if (facts.showcasePinnedCount >= 1) {
    badges.push({ code: "CURATED_SHOWCASE", labelKey: "p8BadgeCuratedShowcase" });
  }
  if (facts.longestStreakWeeks >= 2) {
    badges.push({ code: "CONSISTENT_STREAK", labelKey: "p8BadgeConsistentStreak" });
  }
  if (facts.referralsCount >= 1 || facts.eventMembershipsCount >= 1) {
    badges.push({ code: "COMMUNITY_BUILDER", labelKey: "p8BadgeCommunityBuilder" });
  }
  return badges;
}

export function xpLevel(totalXp: number): number {
  const safe = Math.max(0, Math.floor(totalXp));
  return Math.floor(Math.sqrt(safe / 100)) + 1;
}
