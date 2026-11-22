import { describe, expect, it } from "vitest";
import { pass06 } from "../../src/i18n/pass06";
import {
  PROMOTABLE_CHANNELS,
  SOCIAL_CHANNELS,
  SOCIAL_CHANNEL_META,
  buildExternalShareIntents,
  buildSocialPostTemplate,
  channelLabel,
  isSocialChannel,
} from "../../src/lib/social-channels";
import { platformToSocialChannel } from "../../src/server/social-promote";
import { evaluateQuestCompletion, type QuestFacts } from "../../src/server/quests";

describe("Pass 06 social promotion & viral monetization unit invariants", () => {
  it("keeps EN and FR Pass 06 dictionaries 100% symmetric", () => {
    const enKeys = Object.keys(pass06.en).sort();
    const frKeys = Object.keys(pass06.fr).sort();
    expect(enKeys).toEqual(frKeys);
    expect(enKeys.length).toBeGreaterThan(75);
  });

  it("validates social channel registry and localized labels", () => {
    for (const ch of SOCIAL_CHANNELS) {
      expect(isSocialChannel(ch)).toBe(true);
      expect(SOCIAL_CHANNEL_META[ch]).toBeDefined();
      expect(channelLabel(ch, "fr").length).toBeGreaterThan(0);
      expect(channelLabel(ch, "en").length).toBeGreaterThan(0);
    }
    expect(isSocialChannel("UNKNOWN_NET")).toBe(false);
    expect(PROMOTABLE_CHANNELS.includes("TIKTOK")).toBe(true);
    expect(PROMOTABLE_CHANNELS.includes("INSTAGRAM_STORY")).toBe(true);
    expect(PROMOTABLE_CHANNELS.includes("WHATSAPP")).toBe(true);
  });

  it("maps creator social platform names to canonical tracking channels", () => {
    expect(platformToSocialChannel("TikTok")).toBe("TIKTOK");
    expect(platformToSocialChannel("Instagram")).toBe("INSTAGRAM_STORY");
    expect(platformToSocialChannel("YouTube")).toBe("YOUTUBE");
    expect(platformToSocialChannel("WhatsApp")).toBe("WHATSAPP");
    expect(platformToSocialChannel("Snapchat")).toBe("SNAPCHAT");
    expect(platformToSocialChannel("Discord")).toBe("DISCORD");
    expect(platformToSocialChannel("Threads")).toBe("THREADS");
    expect(platformToSocialChannel("LinkedIn")).toBe("LINKEDIN");
    expect(platformToSocialChannel("X")).toBe("X");
    expect(platformToSocialChannel("Blog")).toBe("DIRECT");
  });

  it("generates platform-tailored campaign templates with legal disclosure and promo code", () => {
    const tiktokFr = buildSocialPostTemplate({
      kind: "CAMPAIGN",
      locale: "fr",
      channel: "TIKTOK",
      url: "https://ruvora.example/go/abc123",
      campaignName: "Forma Studio Automne",
      suggestedHooks: ["Le setup qui m'a fait gagner 2h par semaine"],
      talkingPoints: ["Design sobre", "Livraison rapide"],
      hashtags: ["Design", "#Ruvora"],
      disclosureNote: "#collaborationcommerciale #partenaire",
      promoCode: "MIRA-B35B",
      discountLabel: "-15%",
    });
    expect(tiktokFr.caption).toContain("[HOOK 3s]");
    expect(tiktokFr.caption).toContain("MIRA-B35B");
    expect(tiktokFr.caption).toContain("#collaborationcommerciale");
    expect(tiktokFr.caption).toContain("https://ruvora.example/go/abc123");

    const xEn = buildSocialPostTemplate({
      kind: "CAMPAIGN",
      locale: "en",
      channel: "X",
      url: "https://ruvora.example/go/abc123",
      campaignName: "Forma Studio",
      promoCode: "MIRA-B35B",
    });
    expect(xEn.caption.length).toBeLessThanOrEqual(275);
    expect(xEn.caption).toContain("#ad");

    const referralFr = buildSocialPostTemplate({
      kind: "REFERRAL",
      locale: "fr",
      channel: "WHATSAPP",
      url: "https://ruvora.example/go/ref123",
      creatorHandle: "mira",
    });
    expect(referralFr.caption).toContain("aucun revenu garanti");
    expect(referralFr.caption).toContain("https://ruvora.example/go/ref123");
  });

  it("builds valid URL-encoded external share intent links", () => {
    const intents = buildExternalShareIntents(
      "https://ruvora.example/go/slug123",
      "Check out Ruvora #partnerlink",
    );
    expect(intents.whatsapp).toContain("https://wa.me/?text=");
    expect(intents.x).toContain("https://twitter.com/intent/tweet?text=");
    expect(intents.telegram).toContain("https://t.me/share/url?url=");
    expect(intents.linkedin).toContain("https://www.linkedin.com/sharing/share-offsite/?url=");
    expect(intents.email).toContain("mailto:?subject=");
  });

  it("evaluates Pass 06 XP-only social quests strictly", () => {
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
    };
    expect(evaluateQuestCompletion("FIRST_SOCIAL_SHARE", base)).toBe(false);
    expect(evaluateQuestCompletion("MULTI_CHANNEL_PROMOTER", base)).toBe(false);
    expect(evaluateQuestCompletion("FIRST_REFERRAL_INVITE", base)).toBe(false);

    expect(evaluateQuestCompletion("FIRST_SOCIAL_SHARE", { ...base, socialShareChannels: 1 })).toBe(
      true,
    );
    expect(
      evaluateQuestCompletion("MULTI_CHANNEL_PROMOTER", { ...base, socialShareChannels: 2 }),
    ).toBe(true);
    expect(
      evaluateQuestCompletion("MULTI_CHANNEL_PROMOTER", { ...base, showcasePinnedCount: 1 }),
    ).toBe(true);
    expect(evaluateQuestCompletion("FIRST_REFERRAL_INVITE", { ...base, referralsSent: 1 })).toBe(
      true,
    );
  });
});
