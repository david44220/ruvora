import { describe, expect, it } from "vitest";
import { pass08 } from "../../src/i18n/pass08";
import { isShareSlug, isVanityShareSlug } from "../../src/lib/share-recovery";
import { buildPostPlanIcs, escapeIcsText } from "../../src/lib/ics";
import { computeCreatorBadges, computeWeeklyStreak, xpLevel } from "../../src/lib/retention";
import {
  DEFAULT_NOTIFICATION_PREFS,
  isNotificationKindEnabled,
  normalizeNotificationPrefs,
} from "../../src/lib/notification-prefs";
import { evaluateQuestCompletion, type QuestFacts } from "../../src/server/quests";

describe("Pass 08 i18n EN/FR key parity", () => {
  it("keeps strict EN/FR key parity with non-empty strings", () => {
    const enKeys = Object.keys(pass08.en).sort();
    const frKeys = Object.keys(pass08.fr).sort();
    expect(frKeys).toEqual(enKeys);
    for (const k of enKeys) {
      expect(pass08.en[k as keyof typeof pass08.en].trim().length).toBeGreaterThan(0);
      expect(pass08.fr[k as keyof typeof pass08.fr].trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Pass 08 vanity share slug validation", () => {
  it("accepts clean kebab-case vanity slugs and 24-char opaque slugs", () => {
    expect(isVanityShareSlug("mira-summer-2026")).toBe(true);
    expect(isVanityShareSlug("alex-pack")).toBe(true);
    expect(isShareSlug("mira-summer-2026")).toBe(true);
    expect(isShareSlug("Abcdefghijklmnopqrstuv12")).toBe(true);
  });

  it("rejects single-word strings, reserved prefixes, uppercase, paths, and URLs", () => {
    for (const bad of [
      "invalid",
      "short",
      "admin-promo",
      "api-v1",
      "login-free",
      "ruvora-official",
      "Mira-Summer",
      "https://evil.example/",
      "../register",
      "mira--double",
      "-leading-dash",
      "trailing-dash-",
      "a-b-c-d-e",
    ]) {
      expect(isVanityShareSlug(bad)).toBe(false);
    }
    expect(isShareSlug("invalid")).toBe(false);
    expect(isShareSlug("https://evil.example/")).toBe(false);
    expect(isShareSlug("../register")).toBe(false);
  });
});

describe("Pass 08 RFC 5545 .ics calendar generator", () => {
  it("generates CRLF-formatted VCALENDAR with escaped control chars and 15m VALARM", () => {
    const start = new Date("2026-12-01T18:00:00.000Z");
    const now = new Date("2026-11-23T12:00:00.000Z");
    const ics = buildPostPlanIcs(
      {
        id: "plan_12345",
        title: "Story demo, part 1; promo",
        scheduledFor: start,
        socialChannel: "INSTAGRAM_STORY",
        campaignName: "Atelier Lumiere",
        note: "Line 1\nLine 2",
        appUrl: "https://ruvora.example",
      },
      now,
    );
    expect(ics.includes("\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("UID:ruvora-plan-plan_12345@ruvora.app\r\n");
    expect(ics).toContain("DTSTART:20261201T180000Z\r\n");
    expect(ics).toContain("DTEND:20261201T183000Z\r\n");
    expect(ics).toContain("SUMMARY:Story demo\\, part 1\\; promo [INSTAGRAM_STORY]\r\n");
    expect(ics).toContain("BEGIN:VALARM\r\n");
    expect(ics).toContain("TRIGGER:-PT15M\r\n");
    expect(ics).toContain("END:VCALENDAR\r\n");
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("Pass 08 XP-only weekly streak & milestone badge engine", () => {
  it("computes consecutive ISO-week streaks and keeps streak alive through last week", () => {
    const now = new Date("2026-11-25T12:00:00Z"); // Wed ISO week 48
    const dates = [
      new Date("2026-11-24T10:00:00Z"), // W48
      new Date("2026-11-23T18:00:00Z"), // W48 duplicate
      new Date("2026-11-18T10:00:00Z"), // W47
      new Date("2026-11-11T10:00:00Z"), // W46
      new Date("2026-10-15T10:00:00Z"), // gap
    ];
    const streak = computeWeeklyStreak(dates, now);
    expect(streak.currentStreakWeeks).toBe(3);
    expect(streak.longestStreakWeeks).toBe(3);
    expect(streak.activeThisWeek).toBe(true);
    expect(streak.activeWeeksCount).toBe(4);

    // Still alive if last active week was W47 (previous week)
    const prevOnly = computeWeeklyStreak([new Date("2026-11-18T10:00:00Z")], now);
    expect(prevOnly.currentStreakWeeks).toBe(1);
    expect(prevOnly.activeThisWeek).toBe(false);

    // Broken if last active was 3 weeks ago
    const broken = computeWeeklyStreak([new Date("2026-11-02T10:00:00Z")], now);
    expect(broken.currentStreakWeeks).toBe(0);
    expect(broken.longestStreakWeeks).toBe(1);
  });

  it("derives all deterministic creator milestone badges and XP levels", () => {
    const badges = computeCreatorBadges({
      socialChannelsCount: 3,
      audienceVerified: true,
      showcasePinnedCount: 2,
      longestStreakWeeks: 2,
      referralsCount: 1,
      eventMembershipsCount: 0,
      hasActiveSocialShare: true,
    });
    expect(badges.map((b) => b.code)).toEqual([
      "VERIFIED_CREATOR",
      "ACTIVE_PROMOTER",
      "MULTI_CHANNEL_3",
      "CURATED_SHOWCASE",
      "CONSISTENT_STREAK",
      "COMMUNITY_BUILDER",
    ]);
    expect(xpLevel(0)).toBe(1);
    expect(xpLevel(100)).toBe(2);
    expect(xpLevel(400)).toBe(3);
  });

  it("evaluates Pass 08 XP-only social planning quests", () => {
    const base: QuestFacts = {
      onboarded: true,
      hasHandle: true,
      bioLength: 20,
      emailVerified: true,
      followers: 50,
      socialCount: 1,
      audienceVerified: false,
      validatedActivities: 0,
      eventMemberships: 0,
      referralsSent: 0,
      socialShareChannels: 0,
      showcasePinnedCount: 0,
      postPlansCount: 0,
      publishedPostPlansCount: 0,
    };
    expect(evaluateQuestCompletion("FIRST_POST_PLAN", base)).toBe(false);
    expect(evaluateQuestCompletion("FIRST_POST_PLAN", { ...base, postPlansCount: 1 })).toBe(true);
    expect(evaluateQuestCompletion("CONSISTENT_PROMOTER", { ...base, postPlansCount: 1 })).toBe(
      false,
    );
    expect(
      evaluateQuestCompletion("CONSISTENT_PROMOTER", {
        ...base,
        publishedPostPlansCount: 1,
        socialShareChannels: 1,
      }),
    ).toBe(true);
  });
});

describe("Pass 08 granular notification preferences", () => {
  it("normalizes partial/empty JSON safely and gates only preference-controlled alert kinds", () => {
    expect(normalizeNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    const custom = normalizeNotificationPrefs({
      campaignMatch: false,
      payoutUpdates: false,
      ugcUpdates: true,
      weeklyDigestEmail: true,
    });
    expect(isNotificationKindEnabled("CAMPAIGN_MATCH", custom)).toBe(false);
    expect(isNotificationKindEnabled("PAYOUT_SETTLED", custom)).toBe(false);
    expect(isNotificationKindEnabled("UGC_APPROVED", custom)).toBe(true);
    expect(isNotificationKindEnabled("CAMPAIGN_INVITATION", custom)).toBe(true);
    // Mandatory quest/security notifications remain enabled
    expect(isNotificationKindEnabled("QUEST_CLAIMED", custom)).toBe(true);
  });
});
