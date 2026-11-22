import "dotenv/config";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { User, Campaign } from "@prisma/client";
import { db, atomic, jsonValue } from "../../src/server/db";
import { register } from "../../src/server/auth";
import { hashPassword } from "../../src/server/security/password";
import { saveProfile, getPublicProfile } from "../../src/server/profiles";
import { DEVELOPMENT_RULES } from "../../src/server/rules";
import {
  createCampaign,
  estimateCampaignAudience,
  fundCampaign,
  listCampaigns,
  reviewCampaign,
  submitCampaign,
} from "../../src/server/campaigns";
import { submitActivity, reviewActivity } from "../../src/server/activities";
import {
  beginAudienceVerification,
  confirmAudienceVerification,
} from "../../src/server/audience-verify";
import { listQuests, claimQuest } from "../../src/server/quests";
import { createPromoCode, listCreatorPromoCodes } from "../../src/server/promo-codes";
import {
  getAdvertiserIntegration,
  rotateAdvertiserIntegrationKey,
  listWorkspaceMembers,
  addWorkspaceMember,
  removeWorkspaceMember,
} from "../../src/server/integrations";
import { listNotifications, markNotificationsRead } from "../../src/server/notifications";
import { getAdvertiserAnalytics } from "../../src/server/analytics";
import { exportAdvertiserAnalyticsCsv, exportWalletCsv } from "../../src/server/export";
import { getDashboard } from "../../src/server/views";
import { openSecret } from "../../src/server/security/crypto";

const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!testUrl.pathname.endsWith("_test"))
  throw new Error("Integration tests require DATABASE_URL to name an isolated *_test database.");

const tag = randomUUID().replaceAll("-", "").slice(0, 10);
const password = "pass04-integration-passphrase";
let microCreator: User, participant: User, advertiser: User, teammate: User, admin: User;
let ugcCampaign: Campaign;

describe("Pass 04 universal monetization & advertiser platform integration", () => {
  beforeAll(async () => {
    await atomic(async (tx) => {
      if (!(await tx.economicRule.findFirst({ where: { active: true } }))) {
        await tx.economicRule.create({
          data: { version: `pass04-test-rules-${tag}`, config: jsonValue(DEVELOPMENT_RULES) },
        });
      }
      admin = await tx.user.create({
        data: {
          email: `p4-admin-${tag}@integration.test`,
          passwordHash: await hashPassword(password),
          displayName: "Pass04 Admin",
          handle: `p4_adm_${tag}`,
          roles: ["USER", "ADMIN"],
          country: "FR",
          onboarded: true,
          ageEligible: true,
          termsAcceptedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });
    });

    const mkUser = async (
      role: "USER" | "CREATOR" | "ADVERTISER",
      key: string,
      opts: { city?: string; followers?: number; theme?: "obsidian" | "emerald-dusk" } = {},
    ) => {
      const reg = await register({
        email: `p4-${key}-${tag}@integration.test`,
        password,
        displayName: `Pass04 ${key}`,
        role,
      });
      const base = await db.user.findUniqueOrThrow({ where: { id: reg.user.id } });
      await saveProfile(base, {
        handle: `p4_${key}_${tag}`,
        displayName: `Pass04 ${key}`,
        bio: "Small independent creator testing universal monetization on Ruvora.",
        category: "Photography",
        locale: "fr",
        country: "FR",
        city: opts.city ?? "Paris",
        preferredLanguages: ["fr", "en"],
        profileTheme: opts.theme ?? "obsidian",
        autoMonetize: true,
        ageEligible: true,
        termsAccepted: true,
        socials:
          role === "CREATOR"
            ? [
                {
                  platform: "Instagram",
                  url: `https://www.instagram.com/p4_${key}_${tag}`,
                  followers: opts.followers ?? 28,
                },
              ]
            : [],
        links: [],
      });
      return db.user.findUniqueOrThrow({ where: { id: base.id } });
    };

    microCreator = await mkUser("CREATOR", "micro", {
      city: "Lyon",
      followers: 28,
      theme: "emerald-dusk",
    });
    participant = await mkUser("USER", "part", { city: "Lyon" });
    advertiser = await mkUser("ADVERTISER", "adv");
    teammate = await mkUser("USER", "team");
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("verifies a 28-follower creator via bio-code challenge and preserves VERIFIED status across profile saves", async () => {
    const started = await beginAudienceVerification(microCreator, { platform: "Instagram" });
    expect(started.code).toMatch(/^ruvora-verify-[A-F0-9]{8}$/);

    await expect(
      confirmAudienceVerification(microCreator, {
        platform: "Instagram",
        proofUrl: "https://not-instagram.example/fake",
      }),
    ).rejects.toMatchObject({ code: "PLATFORM_URL_MISMATCH" });

    const confirmed = await confirmAudienceVerification(microCreator, {
      platform: "Instagram",
      proofUrl: `https://www.instagram.com/p4_micro_${tag}`,
      declaredFollowers: 28,
    });
    expect(confirmed.user.audienceStatus).toBe("VERIFIED");
    expect(confirmed.platform).toBe("Instagram");

    microCreator = await db.user.findUniqueOrThrow({ where: { id: microCreator.id } });
    // Saving profile theme/bio without inflating followers keeps VERIFIED badge
    const saved = await saveProfile(microCreator, {
      handle: microCreator.handle!,
      displayName: microCreator.displayName,
      bio: "Updated bio keeping verified status intact.",
      category: "Photography",
      locale: "fr",
      country: "FR",
      city: "Lyon",
      preferredLanguages: ["fr", "en"],
      profileTheme: "champagne",
      autoMonetize: true,
      ageEligible: true,
      termsAccepted: true,
      socials: [
        {
          platform: "Instagram",
          url: `https://www.instagram.com/p4_micro_${tag}`,
          followers: 28,
        },
      ],
      links: [],
    });
    expect(saved.user.audienceStatus).toBe("VERIFIED");
    expect(saved.user.profileTheme).toBe("champagne");
    microCreator = await db.user.findUniqueOrThrow({ where: { id: microCreator.id } });
  });

  it("claims progression quests idempotently for XP only without touching Money or Reward Units", async () => {
    const before = await getDashboard(microCreator);
    const quests = await listQuests(microCreator);
    const verifyQuest = quests.quests.find((q) => q.code === "VERIFY_AUDIENCE");
    expect(verifyQuest?.completed).toBe(true);
    expect(verifyQuest?.claimed).toBe(false);

    const claimed = await claimQuest(microCreator, { questCode: "VERIFY_AUDIENCE" });
    expect(claimed.alreadyClaimed).toBe(false);
    expect(claimed.claim.xpAwarded).toBe(120);

    // Repeat claim is idempotent
    const second = await claimQuest(microCreator, { questCode: "VERIFY_AUDIENCE" });
    expect(second.alreadyClaimed).toBe(true);

    const after = await getDashboard(microCreator);
    expect(after.summary.xp).toBe(before.summary.xp + 120);
    expect(after.summary.moneyMinor).toBe(before.summary.moneyMinor);
    expect(after.summary.ruMicros).toBe(before.summary.ruMicros);
  });

  it("estimates addressable micro-creators accurately and creates a UGC Brief + A/B campaign", async () => {
    const est = await estimateCampaignAudience(advertiser, {
      allowedCountries: ["FR"],
      allowedCities: ["Lyon"],
      allowedLanguages: ["fr"],
      allowedPlatforms: ["Instagram"],
      creatorCategories: ["Photography"],
      minimumCreatorFollowers: 10,
      maximumCreatorFollowers: 200,
      requireVerifiedAudience: true,
      minimumReliabilityScore: 70,
      budgetMinor: "10000",
      unitCostMinor: "100",
    });
    expect(est.matchingCreators).toBeGreaterThanOrEqual(1);
    expect(est.verifiedCreators).toBeGreaterThanOrEqual(1);
    expect(est.estimatedMaxActions).toBe(100);

    const created = await createCampaign(advertiser, {
      name: `UGC Micro Campaign ${tag}`,
      description: "Targeted micro-creator campaign in Lyon",
      objective: "QUALIFIED_VIEW",
      deliveryMode: "UGC_BRIEF",
      destinationUrl: "https://example.com/main",
      budgetMinor: "10000",
      dailyBudgetMinor: "5000",
      unitCostMinor: "100",
      startAt: new Date(Date.now() - 60_000).toISOString(),
      endAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      allowedCountries: ["FR"],
      allowedCities: ["Lyon"],
      allowedLanguages: ["fr"],
      allowedPlatforms: ["Instagram"],
      creatorCategories: ["Photography"],
      minimumCreatorFollowers: 10,
      maximumCreatorFollowers: 200,
      requireVerifiedAudience: true,
      minimumReliabilityScore: 70,
      creativeBrief: {
        headline: "Show everyday photography in Lyon",
        talkingPoints: ["Natural lighting", "Honest creative review"],
        hashtags: ["#LyonPhoto", "#Ruvora"],
        cta: "Check out the gallery",
        formatHint: "Reel 15s",
        assetUrls: ["https://example.com/kit"],
      },
      abVariants: [
        { id: "A", label: "Warm Landing", destinationUrl: "https://example.com/a" },
        { id: "B", label: "Minimal Landing", destinationUrl: "https://example.com/b" },
      ],
    });
    ugcCampaign = created.campaign;
    await fundCampaign(advertiser, ugcCampaign.id, {
      amountMinor: "10000",
      idempotencyKey: `p4-fund-${tag}`,
      source: "DEVELOPMENT",
    });
    await submitCampaign(advertiser, ugcCampaign.id);
    await reviewCampaign(admin, ugcCampaign.id, {
      decision: "APPROVE",
      reason: "Independent Pass 04 integration review of targeted UGC campaign.",
    });

    const forCreator = await listCampaigns(microCreator, { forCreator: true });
    expect(forCreator.campaigns.some((c) => c.id === ugcCampaign.id)).toBe(true);
  });

  it("mints personal creator promo codes, tracks A/B variant + risk score, validates, and updates analytics & CSV exports", async () => {
    const promo = await createPromoCode(microCreator, {
      campaignId: ugcCampaign.id,
      discountLabel: "-10%",
    });
    expect(promo.created).toBe(true);
    expect(promo.promoCode.code).toContain("-");

    // Public profile reflects theme, verified badge, and personal promo code
    const pub = await getPublicProfile(microCreator.handle!);
    expect(pub.profile.profileTheme).toBe("champagne");
    expect(pub.profile.audienceStatus).toBe("VERIFIED");
    const list = await listCreatorPromoCodes(microCreator);
    expect(list.promoCodes.some((p) => p.code === promo.promoCode.code)).toBe(true);

    // Participant submits activity with A/B variant B and creator's promo code
    const submitted = await submitActivity(participant, {
      campaignId: ugcCampaign.id,
      type: "QUALIFIED_VIEW",
      idempotencyKey: `p4-act-${tag}`,
      evidence: "https://www.instagram.com/p/ugc-submission-example",
      abVariantId: "B",
      promoCode: promo.promoCode.code,
    });
    expect(submitted.activity.abVariantId).toBe("B");
    expect(submitted.activity.promoCodeUsed).toBe(promo.promoCode.code);
    expect(submitted.activity.riskScore).toBeGreaterThanOrEqual(0);

    await reviewActivity(admin, submitted.activity.id, {
      decision: "VALIDATE",
      reason: "Verified UGC brief submission and promo code usage.",
      evidenceVerified: true,
    });

    const updatedPromo = await db.promoCode.findUniqueOrThrow({
      where: { id: promo.promoCode.id },
    });
    expect(updatedPromo.usesCount).toBe(1);

    const analytics = await getAdvertiserAnalytics(advertiser);
    expect(analytics.summary.validatedActions).toBeGreaterThanOrEqual(1);
    expect(analytics.summary.ecpcMinor).toBe(100n);
    expect(analytics.byVariant.some((v) => v.variantId === "B" && v.validatedActions >= 1)).toBe(
      true,
    );
    expect(analytics.byCountry.some((c) => c.country === "FR")).toBe(true);

    const advCsv = await exportAdvertiserAnalyticsCsv(advertiser);
    expect(advCsv).toContain("campaign_id,campaign_name,validated_actions");
    expect(advCsv).toContain(ugcCampaign.id);

    const walletCsv = await exportWalletCsv(participant);
    expect(walletCsv).toContain("entry_id,date_utc,transaction_id");
  });

  it("rotates AES-256-GCM encrypted advertiser integration keys, manages agency team, and marks notifications read", async () => {
    const initial = await getAdvertiserIntegration(advertiser);
    expect(initial.configured).toBe(false);

    const rotated = await rotateAdvertiserIntegrationKey(advertiser);
    expect(rotated.signingKey).toMatch(/^ruv_whsec_/);
    expect(rotated.shownOnce).toBe(true);

    // Verify encrypted at rest in DB
    const row = await db.advertiserIntegration.findUniqueOrThrow({
      where: { advertiserId: advertiser.id },
    });
    expect(row.sealedSigningKey).not.toContain(rotated.signingKey);
    expect(openSecret(row.sealedSigningKey, `advertiser-integration:${advertiser.id}`)).toBe(
      rotated.signingKey,
    );

    const after = await getAdvertiserIntegration(advertiser);
    expect(after.configured).toBe(true);
    expect(after.keyPrefix).toBe(rotated.keyPrefix);

    // Agency team add & remove
    const added = await addWorkspaceMember(advertiser, {
      email: teammate.email,
      role: "CAMPAIGN_MANAGER",
    });
    expect(added.membership.role).toBe("CAMPAIGN_MANAGER");
    const team = await listWorkspaceMembers(advertiser);
    expect(team.members.some((m) => m.member.id === teammate.id)).toBe(true);

    // Teammate received workspace invite notification & can mark read
    const notifs = await listNotifications(teammate);
    expect(notifs.unreadCount).toBeGreaterThanOrEqual(1);
    expect(notifs.notifications.some((n) => n.kind === "WORKSPACE_INVITE")).toBe(true);
    const readRes = await markNotificationsRead(teammate, {});
    expect(readRes.unreadCount).toBe(0);

    const removed = await removeWorkspaceMember(advertiser, { memberId: teammate.id });
    expect(removed.removed).toBe(true);
  });
});
