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
  transitionCampaign,
} from "../../src/server/campaigns";
import { depositAdvertiserBalance } from "../../src/server/providers/payments";
import { createPromoCode } from "../../src/server/promo-codes";
import { getReferralEntry, startAttribution } from "../../src/server/attribution";
import {
  deleteCreatorCollection,
  getPublicCollection,
  listCreatorCollections,
  upsertCreatorCollection,
} from "../../src/server/collections";
import {
  confirmAudienceSubscription,
  deleteAudienceSubscriber,
  exportCreatorAudienceCsv,
  listCreatorAudienceSubscribers,
  subscribeToCreatorAudience,
  unsubscribeAudience,
} from "../../src/server/audience-capture";
import {
  listSavedCampaigns,
  notifySavedCampaignWatchers,
  toggleSavedCampaign,
} from "../../src/server/saved-campaigns";
import { renderShareCard } from "../../src/server/share-card";
import { getReferralFunnel } from "../../src/server/social-promote";
import { claimQuest, listQuests } from "../../src/server/quests";
import { anonymizeUserAccount, exportUserGdprData } from "../../src/server/gdpr";
import { openSecret } from "../../src/server/security/crypto";
import { DEVELOPMENT_RULES } from "../../src/server/rules";

const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!testUrl.pathname.endsWith("_test"))
  throw new Error("Integration tests require DATABASE_URL to name an isolated *_test database.");

const runTag = `p9_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

describe("Pass 09 PostgreSQL integration — Multi-Offer Collections, Double Opt-In Audience Capture, Carousels, Saved Alerts & Referral Channels", () => {
  let advertiserId = "";
  let creatorId = "";
  let creatorHandle = "";
  let campaignId1 = "";
  let campaignId2 = "";
  let adminUserId = "";
  let collectionId = "";
  let collectionSlug = "";

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeAll(async () => {
    process.env.ALLOW_DEMO_FUNDING = "true";
    const existingRule = await db.economicRule.findFirst({ where: { active: true } });
    if (!existingRule) {
      await db.economicRule.create({
        data: {
          version: "pass09-test-v1",
          active: true,
          config: jsonValue(DEVELOPMENT_RULES),
        },
      });
    }

    const adminReg = await register({
      email: `${runTag}_admin@ruvora.test`,
      password: "AdminPassword123!",
      displayName: "Pass09 Admin",
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
      displayName: "Maison Nova Brand",
      role: "ADVERTISER",
      locale: "fr",
    });
    advertiserId = advReg.user.id;
    const advUser = await db.user.findUniqueOrThrow({ where: { id: advertiserId } });
    await saveProfile(advUser, {
      handle: `${runTag.slice(0, 12)}_adv`,
      displayName: "Maison Nova Brand",
      bio: "Partenaire Pass 09",
      category: "Tech",
      locale: "fr",
      country: "FR",
      ageEligible: true,
      termsAccepted: true,
      roles: ["USER", "ADVERTISER"],
      socials: [],
      links: [],
    });
    const freshAdv = await db.user.findUniqueOrThrow({ where: { id: advertiserId } });
    await depositAdvertiserBalance(freshAdv, {
      amountMinor: 50000,
      idempotencyKey: `${runTag}-dep`,
    });

    const now = Date.now();
    const startAt = new Date(now - 3600_000).toISOString();
    const endAt = new Date(now + 14 * 86400_000).toISOString();

    for (const idx of [1, 2]) {
      const created = await createCampaign(freshAdv, {
        name: `Pass09 Offer ${idx} ${runTag.slice(-4)}`,
        description: `Offre partenaire vérifiée #${idx} avec pack créatif complet.`,
        objective: idx === 1 ? "CLICK" : "QUALIFIED_VIEW",
        destinationUrl: `https://example.com/p9-offer-${idx}`,
        budgetMinor: 10000,
        dailyBudgetMinor: 5000,
        unitCostMinor: 500,
        startAt,
        endAt,
        frequencyCap: 3,
        creativeBrief: {
          headline: `Découvrez l'offre #${idx} Maison Nova`,
          talkingPoints: ["Livraison 48h", "Garantie 2 ans"],
          dos: ["Montrer l'unboxing en lumière naturelle"],
          donts: ["Ne pas promettre de gains"],
          brandTone: "Élégant et authentique",
          suggestedHooks: ["Voici le bon plan que je recommande vraiment cette semaine"],
          cta: "Ouvrir via mon lien Ruvora",
          disclosureNote: "#collaboration #partenariat — Lien partenaire Ruvora",
        },
      });
      await fundCampaign(freshAdv, created.campaign.id, {
        amountMinor: 10000,
        idempotencyKey: `${runTag}-fund-${idx}`,
      });
      await submitCampaign(freshAdv, created.campaign.id);
      await reviewCampaign(admin, created.campaign.id, {
        decision: "APPROVE",
        reason: "Approved for Pass 09 test",
      });
      if (idx === 1) campaignId1 = created.campaign.id;
      else campaignId2 = created.campaign.id;
    }

    const crReg = await register({
      email: `${runTag}_creator@ruvora.test`,
      password: "CreatorPassword123!",
      displayName: "Lina Pack",
      role: "CREATOR",
      locale: "fr",
    });
    creatorId = crReg.user.id;
    creatorHandle = `p9_${runTag.slice(-8)}`;
    const crUser = await db.user.findUniqueOrThrow({ where: { id: creatorId } });
    await saveProfile(crUser, {
      handle: creatorHandle,
      displayName: "Lina Pack",
      bio: "Créatrice tech & lifestyle vérifiée sur Ruvora.",
      category: "Tech",
      locale: "fr",
      country: "FR",
      audienceCaptureEnabled: true,
      audienceCapturePrompt: "Reçois mes 3 meilleurs bons plans chaque vendredi !",
      ageEligible: true,
      termsAccepted: true,
      roles: ["USER", "CREATOR"],
      socials: [{ platform: "TikTok", url: "https://tiktok.com/@linapack", followers: 420 }],
      links: [],
    });
    const freshCr = await db.user.findUniqueOrThrow({ where: { id: creatorId } });
    await createPromoCode(freshCr, {
      campaignId: campaignId1,
      discountLabel: "-15%",
    });
  });

  it("creates, publishes, serves public /c/[handle]/[slug] with signed /go links & renders dynamic OG + 3-slide 4:5 carousel PNGs without minting RU or Money", async () => {
    const creator = await db.user.findUniqueOrThrow({ where: { id: creatorId } });
    const ledgerBefore = await db.ledgerEntry.count({ where: { accountId: `user:${creatorId}` } });
    const ruBefore = await db.rewardUnit.count({ where: { userId: creatorId } });

    const slugSuffix = runTag.replace(/[^a-z0-9]/g, "").slice(-6);
    collectionSlug = `top-tech-${slugSuffix}`;
    const saved = await upsertCreatorCollection(creator, {
      slug: collectionSlug,
      title: "Mes 2 Bons Plans Tech",
      description: "Sélection vérifiée pour ma communauté TikTok.",
      theme: "champagne",
      published: true,
      items: [
        { campaignId: campaignId1, creatorNote: "Mon coup de cœur numéro 1" },
        { campaignId: campaignId2, creatorNote: "Super rapport qualité-prix" },
      ],
    });
    collectionId = saved.id;
    expect(saved.publicUrl).toBe(`/c/${creatorHandle}/${collectionSlug}`);

    const listed = await listCreatorCollections(creator);
    expect(listed.collections).toHaveLength(1);
    expect(listed.collections[0]?.items).toHaveLength(2);

    // Public profile links to the published multi-offer pack
    const pubProfile = await getPublicProfile(creatorHandle);
    expect(pubProfile.collections?.some((c) => c.slug === collectionSlug)).toBe(true);
    expect(pubProfile.profile.audienceCaptureEnabled).toBe(true);

    // Public collection view loads with signed /go/ attribution links, promo code, zero budget minor units
    const pubCol = await getPublicCollection(creatorHandle, collectionSlug);
    expect(pubCol.items).toHaveLength(2);
    expect(pubCol.items[0]?.url).toMatch(/^\/go\//);
    expect(pubCol.items[0]?.promoCode).toBeTruthy();
    expect(JSON.stringify(pubCol)).not.toContain("budgetMinor");

    // Dynamic OG Card for Collection + 3-slide 4:5 Portrait Carousel PNGs
    const colOgRes = await renderShareCard("collection", creatorHandle, "fr", {
      collectionSlug,
      format: "banner",
    });
    expect(colOgRes.status).toBe(200);
    expect(colOgRes.headers.get("content-type")).toContain("image/png");

    for (const slide of ["1", "2", "3"]) {
      const slideRes = await renderShareCard("carousel", creatorHandle, "fr", {
        campaignId: campaignId1,
        slide,
        format: "portrait",
      });
      expect(slideRes.status).toBe(200);
      expect(slideRes.headers.get("content-type")).toContain("image/png");
    }

    // Strictly 0 EUR / 0 RU created
    expect(await db.ledgerEntry.count({ where: { accountId: `user:${creatorId}` } })).toBe(
      ledgerBefore,
    );
    expect(await db.rewardUnit.count({ where: { userId: creatorId } })).toBe(ruBefore);

    // Claim FIRST_COLLECTION (+50 XP, 0 RU)
    const qList = await listQuests(creator);
    const colQuest = qList.quests.find((q) => q.code === "FIRST_COLLECTION");
    expect(colQuest?.completed).toBe(true);
    const claim = await claimQuest(creator, { questCode: "FIRST_COLLECTION" });
    expect(claim.claim.xpAwarded).toBe(50);
  });

  it("runs double opt-in AES-256-GCM audience capture, single-use confirm, formula-safe CSV export, AUDIENCE_BUILDER XP quest, and 1-click unsubscribe", async () => {
    const creator = await db.user.findUniqueOrThrow({ where: { id: creatorId } });
    const fanEmail = `fan_${runTag}@example.test`;

    const subRes = await subscribeToCreatorAudience(
      creatorHandle,
      {
        email: fanEmail,
        locale: "fr",
        sourceSlug: `collection:${collectionSlug}`,
        consent: true,
      },
      "127.0.0.1",
    );
    expect(subRes.accepted).toBe(true);
    expect(subRes.status).toBe("PENDING");

    // Verify subscriber email is encrypted at rest (no plaintext in DB column)
    const rawRow = await db.audienceSubscriber.findFirstOrThrow({
      where: { creatorId },
    });
    expect(rawRow.status).toBe("PENDING");
    expect(rawRow.emailCiphertext).not.toContain(fanEmail);

    // Pending subscriber MUST NOT appear in confirmed list or CSV export yet
    const pendingList = await listCreatorAudienceSubscribers(creator);
    expect(pendingList.pendingCount).toBe(1);
    expect(pendingList.confirmedCount).toBe(0);
    expect(await exportCreatorAudienceCsv(creator)).not.toContain(fanEmail);

    // Read encrypted AUDIENCE_CONFIRM MailOutbox item to extract double-opt-in tokens
    const mailRow = await db.mailOutbox.findFirstOrThrow({
      where: { userId: creatorId, purpose: "AUDIENCE_CONFIRM" },
      orderBy: { createdAt: "desc" },
    });
    const decoded = JSON.parse(openSecret(mailRow.payloadCiphertext, "mail:" + mailRow.id)) as {
      to: string;
      variables: { confirmUrl: string; unsubscribeUrl: string };
    };
    expect(decoded.to).toBe(fanEmail);
    const confirmToken = decodeURIComponent(
      new URL(decoded.variables.confirmUrl).hash.replace(/^#audience_confirm=/, ""),
    );
    const unsubToken = decodeURIComponent(
      new URL(decoded.variables.unsubscribeUrl).hash.replace(/^#audience_unsub=/, ""),
    );

    // Confirm double opt-in (single-use)
    const confirmed = await confirmAudienceSubscription({ token: confirmToken });
    expect(confirmed.status).toBe("CONFIRMED");
    await expect(confirmAudienceSubscription({ token: confirmToken })).rejects.toThrow();

    // Now visible in creator's confirmed subscribers & CSV export
    const confirmedList = await listCreatorAudienceSubscribers(creator);
    expect(confirmedList.confirmedCount).toBe(1);
    expect(confirmedList.subscribers[0]?.email).toBe(fanEmail);
    const csv = await exportCreatorAudienceCsv(creator);
    expect(csv).toContain(fanEmail);
    expect(csv).toContain(`collection:${collectionSlug}`);

    // Claim AUDIENCE_BUILDER (+75 XP, 0 RU)
    const claim = await claimQuest(creator, { questCode: "AUDIENCE_BUILDER" });
    expect(claim.claim.xpAwarded).toBe(75);

    // 1-click unsubscribe removes subscriber from confirmed exports
    const unsub = await unsubscribeAudience({ token: unsubToken });
    expect(unsub.status).toBe("UNSUBSCRIBED");
    expect(await exportCreatorAudienceCsv(creator)).not.toContain(fanEmail);

    // Cleanly supports creator manual removal too
    await deleteAudienceSubscriber(creator, rawRow.id);
    expect(await db.audienceSubscriber.count({ where: { creatorId } })).toBe(0);
  });

  it("saves favorite offers, triggers preference-gated RESUMED watcher alerts, tracks referral channels, and erases Pass 09 data on GDPR Art. 17", async () => {
    const creator = await db.user.findUniqueOrThrow({ where: { id: creatorId } });
    const adv = await db.user.findUniqueOrThrow({ where: { id: advertiserId } });

    const savedOn = await toggleSavedCampaign(creator, { campaignId: campaignId1 });
    expect(savedOn.saved).toBe(true);
    const watch = await listSavedCampaigns(creator);
    expect(watch.savedIds).toContain(campaignId1);

    // Pause and resume campaign -> triggers SAVED_CAMPAIGN_ALERT watcher notification
    await transitionCampaign(adv, campaignId1, {
      action: "PAUSE",
      reason: "Brief refresh pause for Pass 09 test",
    });
    await transitionCampaign(adv, campaignId1, {
      action: "RESUME",
      reason: "Campaign back live after brief refresh",
    });
    const notif = await db.notification.findFirst({
      where: { userId: creatorId, kind: "SAVED_CAMPAIGN_ALERT" },
      orderBy: { createdAt: "desc" },
    });
    expect(notif?.titleKey).toBe("p9NotifSavedResumed");

    // Low-capacity watcher is a no-op while remaining capacity >= 20%
    const lowSent = await notifySavedCampaignWatchers(db, campaignId1, "LOW_CAPACITY");
    expect(lowSent).toBe(0);

    // Channel-tracked direct referral link (/r/[handle]?channel=tiktok -> ShareLink TIKTOK)
    const tiktokRef = await getReferralEntry(creatorHandle, "TIKTOK");
    expect(tiktokRef.socialChannel).toBe("TIKTOK");
    await startAttribution(tiktokRef.slug, {});
    const funnel = await getReferralFunnel(creator);
    expect(funnel.byChannel.some((r) => r.channel === "TIKTOK" && r.visits >= 1)).toBe(true);

    // GDPR Art. 20 export includes Pass 09 collections & savedCampaigns
    const gdprExport = (await exportUserGdprData(creator)) as {
      collections: unknown[];
      savedCampaigns: unknown[];
      audienceSubscribersCount: number;
    };
    expect(gdprExport.collections).toHaveLength(1);
    expect(gdprExport.savedCampaigns).toHaveLength(1);
    expect(gdprExport.audienceSubscribersCount).toBe(0);

    // Deleting collection directly works
    await deleteCreatorCollection(creator, collectionId);
    expect(await db.creatorCollection.count({ where: { creatorId } })).toBe(0);

    // Re-create a collection and confirm GDPR Art. 17 anonymization wipes Pass 09 records cleanly
    const gdprSuffix = runTag.replace(/[^a-z0-9]/g, "").slice(-6);
    await upsertCreatorCollection(creator, {
      slug: `gdpr-pack-${gdprSuffix}`,
      title: "Pack GDPR",
      items: [{ campaignId: campaignId1 }],
    });
    await anonymizeUserAccount(creator, undefined, {
      password: "CreatorPassword123!",
      confirmation: "ANONYMIZE_MY_ACCOUNT",
    });
    expect(await db.creatorCollection.count({ where: { creatorId } })).toBe(0);
    expect(await db.savedCampaign.count({ where: { userId: creatorId } })).toBe(0);
    expect(await db.audienceSubscriber.count({ where: { creatorId } })).toBe(0);
    const anon = await db.user.findUniqueOrThrow({ where: { id: creatorId } });
    expect(anon.audienceCaptureEnabled).toBe(false);
    expect(adminUserId).toBeTruthy();
  });
});
