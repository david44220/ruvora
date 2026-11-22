import "dotenv/config";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, jsonValue } from "../../src/server/db";
import { DEVELOPMENT_RULES } from "../../src/server/rules";
import { register } from "../../src/server/auth";
import { getPublicProfile, saveProfile } from "../../src/server/profiles";
import {
  createCampaign,
  fundCampaign,
  reviewCampaign,
  submitCampaign,
} from "../../src/server/campaigns";
import { reviewActivity, submitActivity } from "../../src/server/activities";
import { bindAttribution, createShareLink, startAttribution } from "../../src/server/attribution";
import { getAdvertiserAnalytics, getCreatorAnalytics } from "../../src/server/analytics";
import {
  getChannelAnalytics,
  getPromoteHub,
  getReferralFunnel,
  quickStartPromote,
  recordSocialShareTelemetry,
  removeShowcaseItem,
  upsertShowcaseItem,
} from "../../src/server/social-promote";
import { claimQuest, listQuests } from "../../src/server/quests";
import { renderShareCard } from "../../src/server/share-card";
import { exportUserGdprData } from "../../src/server/gdpr";

const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!testUrl.pathname.endsWith("_test"))
  throw new Error("Integration tests require DATABASE_URL to name an isolated *_test database.");

const PASS = "Pass06Integration!2026#Secure";
let ipSeq = 30;

async function makeAccount(
  prefix: string,
  role: "USER" | "CREATOR" | "ADVERTISER",
  options: { onboard?: boolean; admin?: boolean } = {},
) {
  const tag = randomBytes(4).toString("hex");
  const email = `${prefix}_${tag}@pass06.test`;
  const reg = await register(
    { email, password: PASS, displayName: `${prefix} ${tag}`, role, locale: "fr" },
    `198.51.100.${(ipSeq++ % 220) + 15}`,
  );
  let user = await db.user.findUniqueOrThrow({ where: { id: reg.user.id } });
  if (options.onboard !== false) {
    await saveProfile(user, {
      handle: `${prefix}_${tag}`.slice(0, 24).toLowerCase(),
      displayName: `${prefix} ${tag}`,
      bio: "Pass 06 integration profile",
      category: "Lifestyle",
      locale: "fr",
      country: "FR",
      city: "Paris",
      preferredLanguages: ["fr", "en"],
      autoMonetize: true,
      directoryOptIn: true,
      ageEligible: true,
      termsAccepted: true,
      roles: role === "ADVERTISER" ? ["ADVERTISER"] : role === "CREATOR" ? ["CREATOR"] : ["USER"],
      socials:
        role === "CREATOR"
          ? [{ platform: "TikTok", url: `https://tiktok.com/@${prefix}_${tag}`, followers: 640 }]
          : [],
      links: [],
    });
  }
  user = await db.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      isDemo: true,
      ...(options.admin ? { roles: ["USER", "ADMIN"] } : {}),
    },
  });
  return user;
}

describe("Pass 06 Social Promotion & Viral Monetization PostgreSQL integration", () => {
  const prevAllowDemo = process.env.ALLOW_DEMO_FUNDING;
  let admin: Awaited<ReturnType<typeof makeAccount>>;
  let advertiser: Awaited<ReturnType<typeof makeAccount>>;
  let activeCampaignId: string;

  beforeAll(async () => {
    process.env.ALLOW_DEMO_FUNDING = "true";
    const existingRule = await db.economicRule.findFirst({ where: { active: true } });
    if (!existingRule) {
      await db.economicRule.create({
        data: {
          version: "pass06-test-v1",
          active: true,
          config: jsonValue(DEVELOPMENT_RULES),
        },
      });
    }
    admin = await makeAccount("p6adm", "USER", { admin: true });
    advertiser = await makeAccount("p6adv", "ADVERTISER");

    const now = Date.now();
    const created = await createCampaign(advertiser, {
      name: "Pass 06 Social Drop",
      description: "Campagne test promotion sociale multi-réseaux",
      objective: "CLICK",
      destinationUrl: "https://brand.example/drop",
      budgetMinor: "50000",
      dailyBudgetMinor: "20000",
      unitCostMinor: "1000",
      startAt: new Date(now - 60_000).toISOString(),
      endAt: new Date(now + 7 * 86400_000).toISOString(),
      deliveryMode: "OPEN",
      creativeBrief: {
        headline: "Découvre la nouvelle collection",
        talkingPoints: ["Simple à tester", "Offre limitée"],
        hashtags: ["#Ruvora", "#BonsPlans"],
        cta: "Clique ici",
        formatHint: "Story 9:16",
        disclosureNote: "#collaboration #lienpartenaire",
        suggestedHooks: ["Tu cherches un vrai bon plan cette semaine ?"],
        assetUrls: [],
      },
    });
    activeCampaignId = created.campaign.id;
    await fundCampaign(advertiser, activeCampaignId, {
      amountMinor: "50000",
      idempotencyKey: `p6-fund-${randomBytes(6).toString("hex")}`,
      source: "DEVELOPMENT",
    });
    await submitCampaign(advertiser, activeCampaignId);
    await reviewCampaign(admin, activeCampaignId, {
      decision: "APPROVE",
      reason: "Approved Pass 06 social promotion campaign for integration suite.",
    });
  });

  afterAll(() => {
    if (prevAllowDemo === undefined) delete process.env.ALLOW_DEMO_FUNDING;
    else process.env.ALLOW_DEMO_FUNDING = prevAllowDemo;
  });

  it("activates a regular USER via 60s QuickStart, pins showcase with disclosure, and blocks reserved/self actions", async () => {
    const plainUser = await makeAccount("p6new", "USER", { onboard: false });
    const handle = `p6pro_${randomBytes(3).toString("hex")}`;

    // Reserved handle rejected
    await expect(
      quickStartPromote(plainUser, {
        handle: "promote",
        displayName: "Reserved Check",
        bio: "Bio",
        category: "Lifestyle",
        country: "FR",
        primaryPlatform: "TikTok",
        primarySocialUrl: "https://tiktok.com/@reservedcheck",
        followers: 150,
        campaignIds: [],
        collectionName: "Picks",
        ageEligible: true,
        termsAccepted: true,
      }),
    ).rejects.toThrow();

    const qs = await quickStartPromote(plainUser, {
      handle,
      displayName: "Camille Promo",
      bio: "Je partage mes découvertes sur TikTok et Instagram.",
      category: "Lifestyle",
      country: "FR",
      city: "Lyon",
      primaryPlatform: "TikTok",
      primarySocialUrl: `https://tiktok.com/@${handle}`,
      followers: 240,
      campaignIds: [activeCampaignId],
      collectionName: "Mes Bons Plans Tech",
      ageEligible: true,
      termsAccepted: true,
    });

    expect(qs.user.roles).toContain("CREATOR");
    expect(qs.user.roles).not.toContain("ADMIN");
    expect(qs.primaryChannel).toBe("TIKTOK");
    expect(qs.createdPromoCodes.some((c) => c.campaignId === activeCampaignId)).toBe(true);
    expect(qs.createdLinks.some((l) => l.socialChannel === "TIKTOK")).toBe(true);

    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: plainUser.id } });
    // Update showcase note & verify public profile exposes it
    await upsertShowcaseItem(updatedUser, {
      campaignId: activeCampaignId,
      collectionName: "Mes Bons Plans Tech",
      creatorNote: "Testé pendant 2 semaines, excellent rapport qualité/prix.",
    });

    const pub = await getPublicProfile(handle);
    expect(pub.showcase.length).toBe(1);
    expect(pub.showcase[0]!.collectionName).toBe("Mes Bons Plans Tech");
    expect(pub.showcase[0]!.creatorNote).toContain("Testé pendant 2 semaines");
    expect(pub.showcase[0]!.disclosureNote).toBe("#collaboration #lienpartenaire");
    expect(pub.showcase[0]!.promoCode).toBeTruthy();

    // GDPR export includes showcaseItems
    const gdpr = (await exportUserGdprData(updatedUser)) as { showcaseItems?: unknown[] };
    expect(Array.isArray(gdpr.showcaseItems)).toBe(true);
    expect(gdpr.showcaseItems!.length).toBe(1);

    // Advertiser cannot self-pin their own campaign
    const advCreator = await db.user.update({
      where: { id: advertiser.id },
      data: { roles: ["USER", "ADVERTISER", "CREATOR"], followers: 500 },
    });
    await expect(
      upsertShowcaseItem(advCreator, {
        campaignId: activeCampaignId,
        collectionName: "Self",
        creatorNote: "Self pin attempt",
      }),
    ).rejects.toThrow();

    // Remove showcase item
    await removeShowcaseItem(updatedUser, { campaignId: activeCampaignId });
    const pubAfter = await getPublicProfile(handle);
    expect(pubAfter.showcase.length).toBe(0);
  });

  it("attributes visits, signups, validated activities, and RU accurately per socialChannel (TikTok vs Instagram Story)", async () => {
    const creator = await makeAccount("p6ch", "CREATOR");

    // Distinct opaque slugs per social channel, deterministic reuse on repeat calls
    const directLink = await createShareLink(creator, {
      surface: "CAMPAIGN",
      targetId: activeCampaignId,
    });
    const tiktokLink = await createShareLink(creator, {
      surface: "CAMPAIGN",
      targetId: activeCampaignId,
      socialChannel: "TIKTOK",
    });
    const tiktokRepeat = await createShareLink(creator, {
      surface: "CAMPAIGN",
      targetId: activeCampaignId,
      socialChannel: "TIKTOK",
    });
    const igStoryLink = await createShareLink(creator, {
      surface: "CAMPAIGN",
      targetId: activeCampaignId,
      socialChannel: "INSTAGRAM_STORY",
    });

    expect(tiktokLink.slug).toBe(tiktokRepeat.slug);
    expect(tiktokLink.slug).not.toBe(directLink.slug);
    expect(tiktokLink.slug).not.toBe(igStoryLink.slug);

    // Visitor clicks TikTok link -> signs up -> completes validated activity
    const started = await startAttribution(tiktokLink.slug);
    const tokens = {
      attributionToken: started.attributionToken,
      visitorToken: started.visitorToken,
    };
    const fan = await makeAccount("p6fan", "USER");
    await bindAttribution(fan, tokens, { registration: true });

    const submitted = await submitActivity(
      fan,
      {
        campaignId: activeCampaignId,
        type: "CLICK",
        idempotencyKey: `p6-act-${randomBytes(6).toString("hex")}`,
        evidence: "Verified click from TikTok video description.",
      },
      tokens,
    );
    await reviewActivity(admin, submitted.activity.id, {
      decision: "VALIDATE",
      evidenceVerified: true,
      reason: "Confirmed legitimate TikTok attributed click.",
    });

    // Record telemetry share -> strictly zero money / RU impact
    const telemetry = await recordSocialShareTelemetry(creator, {
      socialChannel: "INSTAGRAM_STORY",
      surface: "CAMPAIGN",
      campaignId: activeCampaignId,
    });
    expect(telemetry.currencyImpact).toBe("NONE");

    const channels = await getChannelAnalytics(creator.id);
    const tiktokRow = channels.find((c) => c.channel === "TIKTOK");
    expect(tiktokRow).toBeDefined();
    expect(tiktokRow!.visits).toBeGreaterThanOrEqual(1);
    expect(tiktokRow!.sessions).toBeGreaterThanOrEqual(1);
    expect(tiktokRow!.registrations).toBeGreaterThanOrEqual(1);
    expect(tiktokRow!.validatedActions).toBe(1);
    expect(tiktokRow!.creatorRuMicros).toBeGreaterThan(0n);

    const creatorStats = await getCreatorAnalytics(creator);
    expect(
      creatorStats.byChannel.some((c) => c.channel === "TIKTOK" && c.validatedActions === 1),
    ).toBe(true);

    const advStats = await getAdvertiserAnalytics(advertiser);
    expect(
      advStats.bySocialChannel.some((c) => c.channel === "TIKTOK" && c.validatedActions >= 1),
    ).toBe(true);

    // XP-only social quests unlocked & claimable without minting RU or money
    const questsBefore = await listQuests(creator);
    const firstSocial = questsBefore.quests.find((q) => q.code === "FIRST_SOCIAL_SHARE");
    const multiChan = questsBefore.quests.find((q) => q.code === "MULTI_CHANNEL_PROMOTER");
    expect(firstSocial?.completed).toBe(true);
    expect(multiChan?.completed).toBe(true);

    const claimed = await claimQuest(creator, { questCode: "FIRST_SOCIAL_SHARE" });
    expect(claimed.claim.xpAwarded).toBe(60);

    // Hub returns populated campaigns, shareLinks, channelAnalytics, and referralFunnel
    const hub = await getPromoteHub(creator);
    expect(hub.isCreatorEligible).toBe(true);
    expect(hub.shareLinks.some((s) => s.socialChannel === "TIKTOK")).toBe(true);
    expect(hub.channelAnalytics.some((c) => c.channel === "TIKTOK")).toBe(true);
  });

  it("renders valid PNG social cards with QR codes in 9:16 story, 1:1 square, and 16:9 banner formats + tracks referral funnel", async () => {
    const creator = await makeAccount("p6ref", "CREATOR");
    const refLink = await createShareLink(creator, {
      surface: "REFERRAL",
      socialChannel: "WHATSAPP",
    });

    // Referee signs up via WhatsApp referral link
    const started = await startAttribution(refLink.slug);
    const friend = await makeAccount("p6frd", "USER");
    await bindAttribution(
      friend,
      { attributionToken: started.attributionToken, visitorToken: started.visitorToken },
      { registration: true },
    );

    const funnel = await getReferralFunnel(creator);
    expect(funnel.invitedCount).toBe(1);
    expect(funnel.publishedProfiles).toBe(1);
    expect(funnel.validatedCreditsCount).toBe(0); // Signup alone creates zero credits!
    expect(funnel.referralRuMicros).toBe(0n);

    // Server PNG rendering for Story (9:16), Square (1:1), and Banner (16:9)
    const storyRes = await renderShareCard("promo", creator.handle!, "fr", {
      format: "story",
      campaignId: activeCampaignId,
      download: true,
    });
    expect(storyRes.status).toBe(200);
    expect(storyRes.headers.get("content-type")).toContain("image/png");
    expect(storyRes.headers.get("content-disposition")).toContain("attachment");
    const storyBytes = Buffer.from(await storyRes.arrayBuffer());
    expect(storyBytes.subarray(0, 4).toString("hex")).toBe("89504e47");

    const squareRes = await renderShareCard("referral", creator.handle!, "en", {
      format: "square",
    });
    expect(squareRes.status).toBe(200);
    const squareBytes = Buffer.from(await squareRes.arrayBuffer());
    expect(squareBytes.subarray(0, 4).toString("hex")).toBe("89504e47");

    const bannerRes = await renderShareCard("profile", creator.handle!, "fr", {
      format: "banner",
    });
    expect(bannerRes.status).toBe(200);
    const bannerBytes = Buffer.from(await bannerRes.arrayBuffer());
    expect(bannerBytes.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});
