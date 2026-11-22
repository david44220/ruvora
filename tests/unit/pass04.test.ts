import { describe, expect, it } from "vitest";
import {
  campaignRegionAllowed,
  canCreatorPromote,
  campaignRelevanceScore,
} from "../../src/server/campaign-eligibility";
import { evaluateActivityRisk, computeReliabilityFromCounts } from "../../src/server/risk";
import { evaluateQuestCompletion } from "../../src/server/quests";
import { formatPromoCode } from "../../src/server/promo-codes";
import { urlMatchesPlatform } from "../../src/server/audience-verify";
import { csvCell, buildCsv } from "../../src/server/export";

describe("Pass 04 universal targeting & relevance scoring", () => {
  const microCreator = {
    roles: ["USER", "CREATOR"] as ("USER" | "CREATOR" | "ADVERTISER" | "ADMIN")[],
    followers: 42,
    category: "Photography",
    country: "FR",
    city: "Paris",
    preferredLanguages: ["fr", "en"],
    socialLinks: [{ platform: "Instagram", url: "https://www.instagram.com/a", followers: 42 }],
    audienceStatus: "VERIFIED",
    suspended: false,
    economicHold: false,
  };

  it("enforces country, city, language, platform, follower band, verified badge, and reliability", () => {
    const campaign = {
      allowedCountries: ["FR"],
      allowedCities: ["Paris", "Lyon"],
      allowedLanguages: ["fr"],
      allowedPlatforms: ["Instagram", "TikTok"],
      creatorCategories: ["Photography"],
      minimumCreatorFollowers: 10,
      maximumCreatorFollowers: 500,
      requireVerifiedAudience: true,
      minimumReliabilityScore: 80,
    };
    expect(canCreatorPromote(microCreator, campaign, 90)).toBe(true);
    expect(canCreatorPromote(microCreator, { ...campaign, maximumCreatorFollowers: 30 }, 90)).toBe(
      false,
    );
    expect(canCreatorPromote(microCreator, { ...campaign, allowedCities: ["Marseille"] }, 90)).toBe(
      false,
    );
    expect(canCreatorPromote(microCreator, { ...campaign, allowedLanguages: ["de"] }, 90)).toBe(
      false,
    );
    expect(
      canCreatorPromote(microCreator, { ...campaign, allowedPlatforms: ["YouTube"] }, 90),
    ).toBe(false);
    expect(
      canCreatorPromote({ ...microCreator, audienceStatus: "SELF_DECLARED" }, campaign, 90),
    ).toBe(false);
    expect(canCreatorPromote(microCreator, campaign, 65)).toBe(false);
  });

  it("permits unrestricted regional/language defaults cleanly", () => {
    expect(
      campaignRegionAllowed(
        { country: "BE", city: null, preferredLanguages: ["fr"] },
        { allowedCountries: [], allowedCities: [], allowedLanguages: [] },
      ),
    ).toBe(true);
  });

  it("ranks strongly matching opportunities higher than generic ones", () => {
    const tailored = campaignRelevanceScore(microCreator, {
      allowedCountries: ["FR"],
      allowedCities: ["Paris"],
      allowedLanguages: ["fr"],
      allowedPlatforms: ["Instagram"],
      creatorCategories: ["Photography"],
      minimumCreatorFollowers: 10,
      deliveryMode: "OPEN",
    });
    const generic = campaignRelevanceScore(microCreator, {
      allowedCountries: [],
      allowedCities: [],
      allowedLanguages: [],
      allowedPlatforms: [],
      creatorCategories: ["Tech"],
      minimumCreatorFollowers: 0,
      deliveryMode: "OPEN",
    });
    expect(tailored).toBeGreaterThan(generic);
    expect(tailored).toBe(100);
  });
});

describe("Pass 04 server risk engine & creator reliability", () => {
  it("computes low risk for clean normal activity and escalates on abuse signals", () => {
    const clean = evaluateActivityRisk({
      rejectedCount30d: 0,
      reversedCount90d: 0,
      submissionsLastHour: 1,
      attributionAgeMs: 45_000,
      type: "CLICK",
      hasEvidence: true,
      hasVerifiedConversion: false,
      isDemoCampaign: false,
      accountAgeHours: 120,
    });
    expect(clean.riskScore).toBe(0);
    expect(clean.signals).toEqual([]);

    const risky = evaluateActivityRisk({
      rejectedCount30d: 4,
      reversedCount90d: 2,
      submissionsLastHour: 12,
      attributionAgeMs: 500,
      type: "CONVERSION",
      hasEvidence: false,
      hasVerifiedConversion: false,
      isDemoCampaign: false,
      accountAgeHours: 2,
    });
    expect(risky.riskScore).toBe(100);
    expect(risky.signals).toContain("REPEATED_REVERSALS");
    expect(risky.signals).toContain("BURST_VELOCITY");
    expect(risky.signals).toContain("RAPID_ATTRIBUTION");
    expect(risky.signals).toContain("UNVERIFIED_CONVERSION");
  });

  it("derives fair trust tiers for new small accounts, trusted creators, and ambassadors", () => {
    const starter = computeReliabilityFromCounts({
      validatedCount: 0,
      rejectedCount: 0,
      reversedCount: 0,
      audienceVerified: false,
      emailVerified: false,
    });
    expect(starter.reliabilityScore).toBe(75);
    expect(starter.tier).toBe("EXPLORER");

    const trusted = computeReliabilityFromCounts({
      validatedCount: 2,
      rejectedCount: 0,
      reversedCount: 0,
      audienceVerified: false,
      emailVerified: true,
    });
    expect(trusted.tier).toBe("TRUSTED");

    const ambassador = computeReliabilityFromCounts({
      validatedCount: 6,
      rejectedCount: 0,
      reversedCount: 0,
      audienceVerified: true,
      emailVerified: true,
    });
    expect(ambassador.reliabilityScore).toBe(100);
    expect(ambassador.tier).toBe("AMBASSADOR");
  });
});

describe("Pass 04 quests, promo codes, platform verification & CSV safety", () => {
  it("evaluates progression quests strictly from verified account facts", () => {
    const facts = {
      onboarded: true,
      hasHandle: true,
      bioLength: 24,
      emailVerified: true,
      followers: 15,
      socialCount: 1,
      audienceVerified: true,
      validatedActivities: 1,
      eventMemberships: 0,
      referralsSent: 0,
    };
    expect(evaluateQuestCompletion("COMPLETE_PROFILE", facts)).toBe(true);
    expect(evaluateQuestCompletion("CONNECT_SOCIAL", facts)).toBe(true);
    expect(evaluateQuestCompletion("VERIFY_AUDIENCE", facts)).toBe(true);
    expect(evaluateQuestCompletion("FIRST_VALIDATED", facts)).toBe(true);
    expect(evaluateQuestCompletion("COMMUNITY_BUILDER", facts)).toBe(false);
  });

  it("formats uppercase alphanumeric promo codes cleanly", () => {
    expect(formatPromoCode("mira_laurent", "7a3b")).toBe("MIRALAUREN-7A3B");
    expect(formatPromoCode("___", "ab12")).toBe("RUVORA-AB12");
  });

  it("validates social platform domain ownership URLs", () => {
    expect(urlMatchesPlatform("Instagram", "https://www.instagram.com/mira")).toBe(true);
    expect(urlMatchesPlatform("Instagram", "https://evil.example/instagram")).toBe(false);
    expect(urlMatchesPlatform("TikTok", "https://tiktok.com/@creator")).toBe(true);
    expect(urlMatchesPlatform("Website", "https://my-portfolio.example/about")).toBe(true);
  });

  it("neutralizes CSV spreadsheet formula injection and escapes RFC 4180 delimiters", () => {
    expect(csvCell("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
    expect(csvCell("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(csvCell("-10+20")).toBe("'-10+20");
    expect(csvCell("@HYPERLINK")).toBe("'@HYPERLINK");
    expect(csvCell('Hello, "Ruvora"')).toBe('"Hello, ""Ruvora"""');
    const csv = buildCsv(["name", "value"], [["=EVIL", "12.50"]]);
    expect(csv).toBe("name,value\r\n'=EVIL,12.50\r\n");
  });
});
