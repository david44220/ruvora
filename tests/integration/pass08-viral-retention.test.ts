import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, jsonValue } from "../../src/server/db";
import { register } from "../../src/server/auth";
import { getPublicProfile, saveProfile } from "../../src/server/profiles";
import {
  createCampaign,
  fundCampaign,
  reviewCampaign,
  submitCampaign,
} from "../../src/server/campaigns";
import { depositAdvertiserBalance } from "../../src/server/providers/payments";
import {
  createShareLink,
  customizeShareLink,
  startAttribution,
} from "../../src/server/attribution";
import { createPromoCode } from "../../src/server/promo-codes";
import { getGoBridgeCard, getPublicCampaignOffer } from "../../src/server/offers";
import { generateCampaignBriefPdf } from "../../src/server/pdf";
import { renderShareCard } from "../../src/server/share-card";
import {
  createPostPlan,
  deletePostPlan,
  getCreatorRetentionSummary,
  getNotificationPreferences,
  getPostPlanIcs,
  getPublicOptInLeaderboard,
  listPostPlans,
  queueWeeklyDigestForUser,
  updateNotificationPreferences,
  updatePostPlan,
} from "../../src/server/retention";
import { notifyUser } from "../../src/server/notifications";
import { claimQuest, listQuests } from "../../src/server/quests";
import { recordSocialShareTelemetry } from "../../src/server/social-promote";
import { anonymizeUserAccount, exportUserGdprData } from "../../src/server/gdpr";
import { getExploreMarketplace } from "../../src/server/explore";
import { DEVELOPMENT_RULES } from "../../src/server/rules";

const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!testUrl.pathname.endsWith("_test"))
  throw new Error("Integration tests require DATABASE_URL to name an isolated *_test database.");

const runTag = `p8_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

describe("Pass 08 PostgreSQL integration — Viral Offers, Vanity Bridge, Planner, Leaderboard & Digest", () => {
  let advertiserId = "";
  let creatorId = "";
  let creatorHandle = "";
  let campaignId = "";
  let adminUserId = "";
  let campaignShareLinkId = "";
  let vanitySlug = "";

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeAll(async () => {
    process.env.ALLOW_DEMO_FUNDING = "true";
    const existingRule = await db.economicRule.findFirst({ where: { active: true } });
    if (!existingRule) {
      await db.economicRule.create({
        data: {
          version: "pass08-test-v1",
          active: true,
          config: jsonValue(DEVELOPMENT_RULES),
        },
      });
    }
    const adminReg = await register({
      email: `${runTag}_admin@ruvora.test`,
      password: "AdminPassword123!",
      displayName: "Pass08 Admin",
      role: "USER",
      locale: "fr",
    });
    const admin = await db.user.update({
      where: { id: adminReg.user.id },
      data: {
        roles: ["USER", "ADMIN"],
        onboarded: true,
        ageEligible: true,
        termsAcceptedAt: new Date(),
      },
    });
    adminUserId = admin.id;

    const advReg = await register({
      email: `${runTag}_adv@ruvora.test`,
      password: "AdvPassword123!",
      displayName: "Atelier Lumiere Brand",
      role: "ADVERTISER",
      locale: "fr",
    });
    advertiserId = advReg.user.id;
    const advUser = await db.user.findUniqueOrThrow({ where: { id: advertiserId } });
    await saveProfile(advUser, {
      handle: `${runTag.slice(0, 12)}_adv`,
      displayName: "Atelier Lumiere Brand",
      bio: "Independent French design studio running verified creator campaigns.",
      category: "Design",
      locale: "fr",
      country: "FR",
      ageEligible: true,
      termsAccepted: true,
      roles: ["USER", "ADVERTISER"],
      socials: [],
      links: [],
    });

    await depositAdvertiserBalance(
      await db.user.findUniqueOrThrow({ where: { id: advertiserId } }),
      { amountMinor: "100000", idempotencyKey: `dep_${runTag}` },
    );

    const created = await createCampaign(
      await db.user.findUniqueOrThrow({ where: { id: advertiserId } }),
      {
        name: `Pack Ete ${runTag}`,
        description: "Campaign with structured Creative Pack and iOS/Android Smart Routing.",
        objective: "CLICK",
        destinationUrl: "https://example.com/atelier-ete",
        budgetMinor: "30000",
        dailyBudgetMinor: "10000",
        unitCostMinor: "200",
        startAt: new Date(Date.now() - 3600_000).toISOString(),
        endAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        allowedCountries: ["FR"],
        allowedPlatforms: ["Instagram", "TikTok"],
        minimumCreatorFollowers: 10,
        deliveryMode: "OPEN",
        smartRouting: {
          iosUrl: "https://apps.apple.com/app/atelier-lumiere",
          androidUrl: "https://play.google.com/store/apps/details?id=com.atelier.lumiere",
        },
        creativeBrief: {
          headline: "Show the unboxing in natural light",
          talkingPoints: ["Handcrafted finish", "2-minute setup"],
          hashtags: ["#atelier", "#design"],
          cta: "Discover via my link",
          formatHint: "Story 9:16",
          disclosureNote: "#collaboration #lienpartenaire",
          suggestedHooks: ["My favorite desk upgrade this week"],
          assetUrls: ["https://example.com/media-pack"],
          brandTone: "Warm, minimalist, authentic",
          colorPalette: ["#0B0A09", "#EDBD89"],
          dos: ["Film in natural daylight", "Show real usage"],
          donts: ["Never promise guaranteed income"],
        },
      },
    );
    campaignId = created.campaign.id;

    const advFresh = await db.user.findUniqueOrThrow({ where: { id: advertiserId } });
    await fundCampaign(advFresh, campaignId, {
      amountMinor: "30000",
      idempotencyKey: `fund_${runTag}`,
    });
    await submitCampaign(advFresh, campaignId);
    await reviewCampaign(
      await db.user.findUniqueOrThrow({ where: { id: adminUserId } }),
      campaignId,
      { decision: "APPROVE", reason: "Pass 08 integration test approval of structured brief." },
    );

    const creatorReg = await register({
      email: `${runTag}_creator@ruvora.test`,
      password: "CreatorPassword123!",
      displayName: "Camille Creator",
      role: "CREATOR",
      locale: "fr",
    });
    creatorId = creatorReg.user.id;
    creatorHandle = `${runTag.slice(0, 12)}_cr`;
    await saveProfile(await db.user.findUniqueOrThrow({ where: { id: creatorId } }), {
      handle: creatorHandle,
      displayName: "Camille Creator",
      bio: "Sharing honest design & tech picks with my French community.",
      category: "Design",
      locale: "fr",
      country: "FR",
      ageEligible: true,
      termsAccepted: true,
      roles: ["USER", "CREATOR"],
      leaderboardOptIn: false,
      socials: [{ platform: "Instagram", url: "https://instagram.com/camille", followers: 420 }],
      links: [],
    });
    await db.user.update({
      where: { id: creatorId },
      data: { emailVerifiedAt: new Date() },
    });
  });

  it("loads public campaign offer sheet with Creative Pack, generates Brief PDF & OG PNG without exposing escrow", async () => {
    const offer = await getPublicCampaignOffer(campaignId);
    expect(offer.name).toBe(`Pack Ete ${runTag}`);
    expect(offer.hasSmartRouting).toBe(true);
    expect(offer.budgetRemainingPct).toBe(100);
    expect(offer.creativeBrief?.brandTone).toBe("Warm, minimalist, authentic");
    expect(offer.creativeBrief?.colorPalette).toEqual(["#0B0A09", "#EDBD89"]);
    expect(offer.creativeBrief?.dos).toContain("Film in natural daylight");
    expect(offer.creativeBrief?.donts).toContain("Never promise guaranteed income");
    expect("budgetMinor" in offer).toBe(false);
    expect("remainingMinor" in offer).toBe(false);

    const pdf = await generateCampaignBriefPdf(campaignId, null, "fr");
    expect(pdf.filename).toContain("ruvora-brief-");
    const pdfStr = pdf.buffer.toString("latin1");
    expect(pdfStr.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfStr).toContain("Film in natural daylight");
    expect(pdfStr).toContain("#0B0A09");
    expect(pdfStr).not.toContain("30000");

    const ogPng = await renderShareCard("campaign", campaignId, "fr");
    expect(ogPng.status).toBe(200);
    expect(ogPng.headers.get("content-type")).toContain("image/png");
  });

  it("supports vanity short slugs, Mobile Offer Bridge routing with Smart Routing, and guards reserved/invalid slugs", async () => {
    const creator = await db.user.findUniqueOrThrow({ where: { id: creatorId } });
    const createdShare = await createShareLink(creator, {
      surface: "CAMPAIGN",
      targetId: campaignId,
      socialChannel: "INSTAGRAM_STORY",
    });
    const shareRow = await db.shareLink.findUniqueOrThrow({ where: { slug: createdShare.slug } });
    campaignShareLinkId = shareRow.id;

    await createPromoCode(creator, { campaignId, discountLabel: "-15%" });

    await expect(
      customizeShareLink(creator, { shareLinkId: campaignShareLinkId, customSlug: "invalid" }),
    ).rejects.toMatchObject({ code: "VANITY_SLUG_INVALID" });

    vanitySlug = `camille-${runTag.replace(/[^a-z0-9]/g, "").slice(-6)}-ete`;
    const customized = await customizeShareLink(creator, {
      shareLinkId: campaignShareLinkId,
      customSlug: vanitySlug,
      bridgeEnabled: true,
    });
    expect(customized.shareLink.customSlug).toBe(vanitySlug);
    expect(customized.shareLink.customUrl).toBe(`/go/${vanitySlug}`);
    expect(customized.shareLink.bridgeEnabled).toBe(true);

    // Opening the vanity slug sets attribution & redirects to /go-card/<vanity>
    const started = await startAttribution(vanitySlug, undefined, null, {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      acceptLanguage: "fr-FR,fr;q=0.9",
    });
    expect(started.redirectTo).toBe(`/go-card/${vanitySlug}`);
    expect(started.attributionToken).toHaveLength(43);

    // Bridge page resolves iOS Smart Routing destination & shows personal promo code
    const bridge = await getGoBridgeCard(vanitySlug, {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    expect(bridge.campaignId).toBe(campaignId);
    expect(bridge.promoCode).toBeTruthy();
    expect(bridge.outboundUrl).toBe("https://apps.apple.com/app/atelier-lumiere");
    expect(bridge.creatorHandle).toBe(creatorHandle);

    // Non-campaign share links cannot enable bridge mode
    const profileLink = await createShareLink(creator, { surface: "PROFILE" });
    const profileRow = await db.shareLink.findUniqueOrThrow({ where: { slug: profileLink.slug } });
    await expect(
      customizeShareLink(creator, { shareLinkId: profileRow.id, bridgeEnabled: true }),
    ).rejects.toMatchObject({ code: "BRIDGE_CAMPAIGN_ONLY" });
  });

  it("manages CreatorPostPlan CRUD + .ics export + XP-only quests + streaks/badges + opt-in leaderboard + Milestone PNG", async () => {
    const creator = await db.user.findUniqueOrThrow({ where: { id: creatorId } });

    // Privacy-first: not in leaderboard while leaderboardOptIn = false
    const lbBefore = await getPublicOptInLeaderboard();
    expect(lbBefore.some((e) => e.handle === creatorHandle)).toBe(false);

    // Create post plan -> zero money/RU impact
    const createdPlan = await createPostPlan(creator, {
      campaignId,
      socialChannel: "INSTAGRAM_STORY",
      title: "Story unboxing + code promo",
      scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
      note: "Daylight shot",
    });
    expect(createdPlan.currencyImpact).toBe("NONE");

    const listed = await listPostPlans(creator);
    expect(listed.plans.some((p) => p.id === createdPlan.plan.id)).toBe(true);

    // Export .ics
    const ics = await getPostPlanIcs(creator, createdPlan.plan.id);
    expect(ics.filename).toContain(".ics");
    expect(ics.content).toContain("BEGIN:VCALENDAR");
    expect(ics.content).toContain("Story unboxing + code promo");

    // Mark published + record social share -> unlocks XP-only quests & active weekly streak
    await updatePostPlan(creator, createdPlan.plan.id, {
      status: "PUBLISHED",
      checklist: { linkReady: true, codeCopied: true, disclosureIncluded: true },
    });
    await recordSocialShareTelemetry(creator, {
      socialChannel: "INSTAGRAM_STORY",
      surface: "CAMPAIGN",
      campaignId,
    });

    const questsBefore = await listQuests(creator);
    const planQuest = questsBefore.quests.find((q) => q.code === "FIRST_POST_PLAN");
    expect(planQuest?.completed).toBe(true);
    const claimRes = await claimQuest(creator, { questCode: "FIRST_POST_PLAN" });
    expect(claimRes.claim.xpAwarded).toBe(50);

    // Opt in to community XP leaderboard
    await saveProfile(await db.user.findUniqueOrThrow({ where: { id: creatorId } }), {
      handle: creatorHandle,
      displayName: "Camille Creator",
      bio: "Sharing honest design & tech picks with my French community.",
      category: "Design",
      locale: "fr",
      country: "FR",
      ageEligible: true,
      termsAccepted: true,
      roles: ["USER", "CREATOR"],
      leaderboardOptIn: true,
      socials: [{ platform: "Instagram", url: "https://instagram.com/camille", followers: 420 }],
      links: [],
    });

    const retention = await getCreatorRetentionSummary(creatorId);
    expect(retention.totalXp).toBeGreaterThanOrEqual(50);
    expect(retention.streak.currentStreakWeeks).toBeGreaterThanOrEqual(1);
    expect(retention.badges.some((b) => b.code === "ACTIVE_PROMOTER")).toBe(true);

    const publicProfile = await getPublicProfile(creatorHandle);
    expect(publicProfile.profile.badges?.some((b) => b.code === "ACTIVE_PROMOTER")).toBe(true);
    expect(publicProfile.profile.streakWeeks).toBeGreaterThanOrEqual(1);

    const explore = await getExploreMarketplace();
    const lbEntry = explore.leaderboard.find((e) => e.handle === creatorHandle);
    expect(lbEntry).toBeDefined();
    expect(lbEntry?.totalXp).toBeGreaterThanOrEqual(50);
    expect("moneyMinor" in (lbEntry as object)).toBe(false);
    expect("ruMicros" in (lbEntry as object)).toBe(false);

    // Milestone Story PNG renders cleanly even below 100 XP
    const milestonePng = await renderShareCard("milestone", creatorHandle, "fr", {
      format: "story",
    });
    expect(milestonePng.status).toBe(200);
    expect(milestonePng.headers.get("content-type")).toContain("image/png");

    // Verify zero Money / RU created by all retention/planning features
    const [ledgerCount, ruCount] = await Promise.all([
      db.ledgerEntry.count({ where: { accountId: `user:${creatorId}` } }),
      db.rewardUnit.count({ where: { userId: creatorId } }),
    ]);
    expect(ledgerCount).toBe(0);
    expect(ruCount).toBe(0);

    // Delete works for owner
    const secondPlan = await createPostPlan(creator, {
      socialChannel: "TIKTOK",
      title: "Temporary draft plan",
      scheduledFor: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    const del = await deletePostPlan(creator, secondPlan.plan.id);
    expect(del.deleted).toBe(true);
  });

  it("enforces granular notification preferences, queues encrypted weekly digest, and covers Pass 08 data in GDPR export/anonymization", async () => {
    const creator = await db.user.findUniqueOrThrow({ where: { id: creatorId } });

    await updateNotificationPreferences(creator, {
      campaignMatch: false,
      payoutUpdates: true,
      ugcUpdates: true,
      weeklyDigestEmail: true,
    });
    const prefs = await getNotificationPreferences(creator);
    expect(prefs.preferences.campaignMatch).toBe(false);
    expect(prefs.preferences.weeklyDigestEmail).toBe(true);

    // Disabled CAMPAIGN_MATCH notification is suppressed
    const suppressed = await db.$transaction((tx) =>
      notifyUser(tx, {
        userId: creatorId,
        kind: "CAMPAIGN_MATCH",
        titleKey: "p7NotifCampaignMatch",
        bodyParams: { campaign: "Suppressed" },
      }),
    );
    expect(suppressed).toBeNull();

    // Queue weekly digest into encrypted MailOutbox
    const digest = await queueWeeklyDigestForUser(creator);
    expect(digest.queued).toBe(true);
    const mailRow = await db.mailOutbox.findUnique({ where: { id: digest.mailId } });
    expect(mailRow?.purpose).toBe("WEEKLY_DIGEST");
    expect(mailRow?.payloadCiphertext).not.toContain(creatorHandle);

    // Cooldown enforced when bypassCooldownInDev is false
    await expect(
      queueWeeklyDigestForUser(creator, { bypassCooldownInDev: false }),
    ).rejects.toMatchObject({ code: "DIGEST_COOLDOWN" });

    // GDPR Art. 20 export includes postPlans, leaderboardOptIn & notificationPrefs
    const exported = (await exportUserGdprData(
      await db.user.findUniqueOrThrow({ where: { id: creatorId } }),
    )) as Record<string, unknown>;
    expect(Array.isArray(exported.postPlans)).toBe(true);
    expect((exported.postPlans as unknown[]).length).toBeGreaterThanOrEqual(1);
    const exportedProfile = exported.profile as Record<string, unknown>;
    expect(exportedProfile.leaderboardOptIn).toBe(true);
    expect(exportedProfile.notificationPrefs).toBeTruthy();

    // GDPR Art. 17 anonymization deletes CreatorPostPlan & resets leaderboardOptIn
    await anonymizeUserAccount(
      await db.user.findUniqueOrThrow({ where: { id: creatorId } }),
      undefined,
      { password: "CreatorPassword123!", confirmation: "ANONYMIZE_MY_ACCOUNT" },
    );
    const remainingPlans = await db.creatorPostPlan.count({ where: { userId: creatorId } });
    expect(remainingPlans).toBe(0);
    const anonUser = await db.user.findUniqueOrThrow({ where: { id: creatorId } });
    expect(anonUser.leaderboardOptIn).toBe(false);
  });
});
