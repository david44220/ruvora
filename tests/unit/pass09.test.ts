import { describe, expect, it } from "vitest";
import { en, fr } from "../../src/i18n/messages";
import { pass09En, pass09Fr } from "../../src/i18n/pass09";
import { errorMessage } from "../../src/i18n/errors";
import { isCollectionSlug, slugifyCollectionTitle } from "../../src/lib/collections";
import { buildCarouselSlides, buildVideoScript } from "../../src/lib/video-scripts";
import { normalizeSocialChannel } from "../../src/lib/social-channels";
import {
  DEFAULT_NOTIFICATION_PREFS,
  isNotificationKindEnabled,
} from "../../src/lib/notification-prefs";
import {
  evaluateQuestCompletion,
  QUEST_DEFINITIONS,
  type QuestFacts,
} from "../../src/server/quests";

describe("Pass 09 i18n & error dictionary parity", () => {
  it("keeps exact EN/FR key parity for all Pass 09 messages", () => {
    const enKeys = Object.keys(pass09En).sort();
    const frKeys = Object.keys(pass09Fr).sort();
    expect(enKeys).toEqual(frKeys);
    for (const key of enKeys) {
      expect(en[key as keyof typeof en]).toBeTruthy();
      expect(fr[key as keyof typeof fr]).toBeTruthy();
    }
  });

  it("translates all Pass 09 error codes in EN and FR", () => {
    const codes = [
      "COLLECTION_NOT_FOUND",
      "COLLECTION_LIMIT",
      "INVALID_COLLECTION_SLUG",
      "AUDIENCE_CAPTURE_DISABLED",
      "INVALID_AUDIENCE_TOKEN",
      "SUBSCRIBER_NOT_FOUND",
      "SAVED_CAMPAIGN_LIMIT",
    ];
    for (const code of codes) {
      expect(errorMessage(code, "en")).not.toContain("We could not complete");
      expect(errorMessage(code, "fr")).not.toContain("Impossible de terminer");
    }
  });
});

describe("Pass 09 collection slug helpers", () => {
  it("accepts clean kebab-case slugs and rejects reserved or malformed strings", () => {
    expect(isCollectionSlug("summer-picks")).toBe(true);
    expect(isCollectionSlug("top-3-tech-2026")).toBe(true);
    expect(isCollectionSlug("bons-plans")).toBe(true);
    expect(isCollectionSlug("admin")).toBe(false);
    expect(isCollectionSlug("login")).toBe(false);
    expect(isCollectionSlug("ab")).toBe(false);
    expect(isCollectionSlug("bad slug!")).toBe(false);
    expect(isCollectionSlug("../etc")).toBe(false);
  });

  it("slugifies French accented titles cleanly into valid collection slugs", () => {
    const slug = slugifyCollectionTitle("Mes 3 Bons Plans Été!");
    expect(slug).toBe("mes-3-bons-plans-ete");
    expect(isCollectionSlug(slug)).toBe(true);
    const reserved = slugifyCollectionTitle("Admin");
    expect(isCollectionSlug(reserved)).toBe(true);
    expect(reserved).not.toBe("admin");
  });
});

describe("Pass 09 deterministic video script & 3-slide carousel generator", () => {
  const sampleInput = {
    locale: "fr" as const,
    campaignName: "Atelier Lumière",
    description: "Découvrez notre nouvelle gamme créateur éco-conçue.",
    creatorHandle: "mira",
    promoCode: "MIRA-2026",
    discountLabel: "-15%",
    shareUrl: "https://ruvora.app/go/mira-lumiere",
    brief: {
      headline: "La lampe studio pensée pour les créateurs mobiles",
      talkingPoints: ["Autonomie 12h USB-C", "Température couleur réglable"],
      dos: ["Filmer en lumière naturelle"],
      suggestedHooks: ["Voici l'accessoire qui a changé mes Reels cette semaine"],
      brandTone: "Chaleureux et direct",
      cta: "Clique mon lien Ruvora pour tester",
      disclosureNote: "#collaboration #partenariat — Lien partenaire Ruvora",
    },
  };

  it("generates distinct timestamped storyboards for TikTok 15s, Reels 30s and Shorts 30s", () => {
    const tiktok = buildVideoScript("TIKTOK_15S", sampleInput);
    const reels = buildVideoScript("REELS_30S", sampleInput);
    const shorts = buildVideoScript("YOUTUBE_SHORTS_30S", { ...sampleInput, locale: "en" });

    expect(tiktok.durationSec).toBe(15);
    expect(tiktok.beats).toHaveLength(3);
    expect(tiktok.fullText).toContain("MIRA-2026");
    expect(tiktok.fullText).toContain("#collaboration");

    expect(reels.durationSec).toBe(30);
    expect(reels.beats).toHaveLength(4);
    expect(reels.beats[0]?.spoken).toContain("accessoire");

    expect(shorts.durationSec).toBe(30);
    expect(shorts.beats).toHaveLength(4);
    expect(shorts.fullText).toContain("Required disclosure");
  });

  it("builds 3 structured carousel slides with QR and promo code on slide 3", () => {
    const slides = buildCarouselSlides(sampleInput);
    expect(slides).toHaveLength(3);
    expect(slides[0].slideNumber).toBe(1);
    expect(slides[0].showQr).toBe(false);
    expect(slides[1].slideNumber).toBe(2);
    expect(slides[1].bullets.length).toBeGreaterThanOrEqual(2);
    expect(slides[2].slideNumber).toBe(3);
    expect(slides[2].showQr).toBe(true);
    expect(slides[2].showPromo).toBe(true);
  });
});

describe("Pass 09 channel normalization, saved-offer alerts & XP-only quests", () => {
  it("normalizes referral query channel parameters safely", () => {
    expect(normalizeSocialChannel("tiktok")).toBe("TIKTOK");
    expect(normalizeSocialChannel("ig")).toBe("INSTAGRAM_STORY");
    expect(normalizeSocialChannel("twitter")).toBe("X");
    expect(normalizeSocialChannel("shorts")).toBe("YOUTUBE");
    expect(normalizeSocialChannel("whatsapp")).toBe("WHATSAPP");
    expect(normalizeSocialChannel("unknown-value")).toBe("DIRECT");
    expect(normalizeSocialChannel(null)).toBe("DIRECT");
  });

  it("gates SAVED_CAMPAIGN_ALERT with campaignMatch notification preference", () => {
    expect(isNotificationKindEnabled("SAVED_CAMPAIGN_ALERT", DEFAULT_NOTIFICATION_PREFS)).toBe(
      true,
    );
    expect(
      isNotificationKindEnabled("SAVED_CAMPAIGN_ALERT", {
        ...DEFAULT_NOTIFICATION_PREFS,
        campaignMatch: false,
      }),
    ).toBe(false);
  });

  it("evaluates FIRST_COLLECTION and AUDIENCE_BUILDER quests strictly on XP facts", () => {
    const base: QuestFacts = {
      onboarded: true,
      hasHandle: true,
      bioLength: 40,
      emailVerified: true,
      followers: 200,
      socialCount: 1,
      audienceVerified: true,
      validatedActivities: 0,
      eventMemberships: 0,
      referralsSent: 0,
      publishedCollectionsCount: 0,
      confirmedSubscribersCount: 0,
    };
    expect(evaluateQuestCompletion("FIRST_COLLECTION", base)).toBe(false);
    expect(
      evaluateQuestCompletion("FIRST_COLLECTION", { ...base, publishedCollectionsCount: 1 }),
    ).toBe(true);
    expect(evaluateQuestCompletion("AUDIENCE_BUILDER", base)).toBe(false);
    expect(
      evaluateQuestCompletion("AUDIENCE_BUILDER", { ...base, confirmedSubscribersCount: 1 }),
    ).toBe(true);

    const p9Defs = QUEST_DEFINITIONS.filter((q) =>
      ["FIRST_COLLECTION", "AUDIENCE_BUILDER"].includes(q.code),
    );
    expect(p9Defs).toHaveLength(2);
    expect(p9Defs.every((q) => q.xpAwarded > 0)).toBe(true);
  });
});
