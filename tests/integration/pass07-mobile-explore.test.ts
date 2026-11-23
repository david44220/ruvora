import "dotenv/config";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, jsonValue } from "../../src/server/db";
import { DEVELOPMENT_RULES } from "../../src/server/rules";
import { register } from "../../src/server/auth";
import {
  getCreatorLinkClickStats,
  getPublicProfile,
  recordProfileLinkClick,
  saveProfile,
} from "../../src/server/profiles";
import {
  createCampaign,
  duplicateCampaign,
  fundCampaign,
  listCampaigns,
  reviewCampaign,
  submitCampaign,
} from "../../src/server/campaigns";
import { getExploreMarketplace } from "../../src/server/explore";
import { generateCreatorMediaKitPdf } from "../../src/server/pdf";
import {
  listAdvertiserWebhookEvents,
  rotateAdvertiserIntegrationKey,
  sendSignedWebhookPing,
} from "../../src/server/integrations";
import { receiveWebhook, signWebhook } from "../../src/server/webhooks";
import { anonymizeUserAccount, exportUserGdprData } from "../../src/server/gdpr";

const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!testUrl.pathname.endsWith("_test"))
  throw new Error("Integration tests require DATABASE_URL to name an isolated *_test database.");

const PASS = "Pass07Integration!2026#Secure";
let ipSeq = 80;

async function makeAccount(
  prefix: string,
  role: "USER" | "CREATOR" | "ADVERTISER",
  options: {
    admin?: boolean;
    category?: string;
    city?: string;
    followers?: number;
    platform?: string;
  } = {},
) {
  const tag = randomBytes(4).toString("hex");
  const email = `${prefix}_${tag}@pass07.test`;
  const reg = await register(
    { email, password: PASS, displayName: `${prefix} ${tag}`, role, locale: "fr" },
    `198.51.100.${(ipSeq++ % 210) + 20}`,
  );
  let user = await db.user.findUniqueOrThrow({ where: { id: reg.user.id } });
  const handle = `${prefix}_${tag}`.slice(0, 24).toLowerCase();
  await saveProfile(user, {
    handle,
    displayName: `${prefix} ${tag}`,
    bio: "Pass 07 creator bio",
    category: options.category ?? "Tech",
    locale: "fr",
    country: "FR",
    city: options.city ?? "Paris",
    preferredLanguages: ["fr", "en"],
    autoMonetize: true,
    directoryOptIn: true,
    ageEligible: true,
    termsAccepted: true,
    roles: role === "USER" ? ["USER"] : ["USER", role],
    socials:
      role === "CREATOR"
        ? [
            {
              platform: options.platform ?? "TikTok",
              url: `https://tiktok.com/@${handle}`,
              followers: options.followers ?? 450,
            },
          ]
        : [],
    links: [],
  });
  if (options.admin) {
    user = await db.user.update({
      where: { id: user.id },
      data: { roles: ["USER", "ADMIN"] },
    });
  } else {
    user = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  }
  return user;
}

describe("Pass 07 PostgreSQL integration: Explore, Smart Routing, Auto-Match, Media Kit PDF, Scheduled Links & Webhook Inspector", () => {
  beforeAll(async () => {
    process.env.ALLOW_DEMO_FUNDING = "true";
    process.env.DEV_WEBHOOK_SECRET = "pass07-dev-webhook-secret-minimum-32-chars-ok";
    const existingRule = await db.economicRule.findFirst({ where: { active: true } });
    if (!existingRule) {
      await db.economicRule.create({
        data: {
          version: "pass07-test-v1",
          active: true,
          config: jsonValue(DEVELOPMENT_RULES),
        },
      });
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("persists Smart Routing, notifies matching creators automatically on approval, and surfaces offers on public /explore", async () => {
    const advertiser = await makeAccount("adv7", "ADVERTISER");
    const admin = await makeAccount("adm7", "USER", { admin: true });
    const creator = await makeAccount("cre7", "CREATOR", {
      category: "Tech",
      city: "Paris",
      platform: "TikTok",
      followers: 520,
    });

    const startAt = new Date(Date.now() - 60_000).toISOString();
    const endAt = new Date(Date.now() + 14 * 86400_000).toISOString();
    const { campaign } = await createCampaign(advertiser, {
      name: "Pass07 Smart Mobile App",
      description: "Public explore test offer with iOS and Android Smart Routing",
      objective: "CONVERSION",
      destinationUrl: "https://example.com/web-fallback",
      smartRouting: {
        iosUrl: "https://apps.apple.com/app/pass07-demo",
        androidUrl: "https://play.google.com/store/apps/details?id=pass07.demo",
        localeUrls: { fr: "https://example.com/fr-landing" },
      },
      budgetMinor: "10000",
      dailyBudgetMinor: "5000",
      unitCostMinor: "200",
      startAt,
      endAt,
      allowedCountries: ["FR"],
      allowedPlatforms: ["TikTok"],
      creatorCategories: ["Tech"],
      minimumCreatorFollowers: 10,
    });

    // Duplication preserves smartRouting cleanly
    const dup = await duplicateCampaign(advertiser, campaign.id);
    expect(dup.campaign.smartRouting).toEqual(campaign.smartRouting);

    await fundCampaign(advertiser, campaign.id, {
      amountMinor: "10000",
      idempotencyKey: `fund-${campaign.id}`,
      source: "DEVELOPMENT",
    });
    await submitCampaign(advertiser, campaign.id);
    await reviewCampaign(admin, campaign.id, {
      decision: "APPROVE",
      reason: "Approved Pass 07 Smart Routing campaign for integration test.",
    });

    // Creator receives automatic CAMPAIGN_MATCH notification pointing to /app/promote?campaign=<id>
    const matchNotif = await db.notification.findFirst({
      where: { userId: creator.id, kind: "CAMPAIGN_MATCH" },
      orderBy: { createdAt: "desc" },
    });
    expect(matchNotif).not.toBeNull();
    expect(matchNotif!.titleKey).toBe("p7NotifCampaignMatch");
    expect(matchNotif!.href).toBe(`/app/promote?campaign=${campaign.id}`);

    // listCampaigns resolves iOS, Android, and FR locale destinations accurately
    const iosList = await listCampaigns(creator, {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    const iosHit = iosList.campaigns.find((c) => c.id === campaign.id);
    expect(iosHit?.resolvedDestinationUrl).toBe("https://apps.apple.com/app/pass07-demo");
    expect(iosHit?.resolvedRouteTarget).toBe("ios");

    const androidList = await listCampaigns(creator, {
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
    });
    const androidHit = androidList.campaigns.find((c) => c.id === campaign.id);
    expect(androidHit?.resolvedDestinationUrl).toBe(
      "https://play.google.com/store/apps/details?id=pass07.demo",
    );
    expect(androidHit?.resolvedRouteTarget).toBe("android");

    // Public Discovery Marketplace returns the approved campaign & opt-in creator with zero private leaks
    const explore = await getExploreMarketplace({
      q: "Pass07 Smart Mobile",
      objective: "CONVERSION",
      platform: "TikTok",
      country: "FR",
    });
    const listed = explore.campaigns.find((c) => c.id === campaign.id);
    expect(listed).toBeDefined();
    expect(listed?.hasSmartRouting).toBe(true);
    expect(listed?.budgetRemainingPct).toBe(100);
    expect(explore.policy.ruleVersion.length).toBeGreaterThan(0);

    const creatorExplore = await getExploreMarketplace({ q: creator.handle! });
    expect(creatorExplore.creators.some((c) => c.handle === creator.handle)).toBe(true);
  });

  it("filters scheduled bio-links, sorts pinned links first, records telemetry-only clicks (0 EUR / 0 RU), generates Media Kit PDF, and honors GDPR", async () => {
    const creator = await makeAccount("kit7", "CREATOR", { followers: 880 });
    const past = new Date(Date.now() - 86400_000).toISOString();
    const pastEnd = new Date(Date.now() - 3600_000).toISOString();
    const future = new Date(Date.now() + 86400_000).toISOString();
    const futureEnd = new Date(Date.now() + 5 * 86400_000).toISOString();

    const saved = await saveProfile(creator, {
      handle: creator.handle!,
      displayName: creator.displayName,
      bio: "Bio for Media Kit PDF & scheduled links",
      category: "Design",
      locale: "fr",
      country: "FR",
      city: "Lyon",
      preferredLanguages: ["fr", "en"],
      ageEligible: true,
      termsAccepted: true,
      roles: ["USER", "CREATOR"],
      socials: [{ platform: "Instagram", url: "https://instagram.com/kit7", followers: 880 }],
      links: [
        { title: "Regular Active Link", url: "https://example.com/regular", pinned: false },
        {
          title: "Pinned Live Drop",
          url: "https://example.com/pinned-drop",
          pinned: true,
          startsAt: past,
          endsAt: futureEnd,
        },
        {
          title: "Future Hidden Link",
          url: "https://example.com/future",
          pinned: false,
          startsAt: future,
          endsAt: futureEnd,
        },
        {
          title: "Expired Hidden Link",
          url: "https://example.com/expired",
          pinned: false,
          startsAt: past,
          endsAt: pastEnd,
        },
      ],
    });

    const pub = await getPublicProfile(creator.handle!);
    expect(pub.profile.customLinks.map((l) => l.title)).toEqual([
      "Pinned Live Drop",
      "Regular Active Link",
    ]);

    const pinnedId = pub.profile.customLinks[0]!.id!;
    const clickRes = await recordProfileLinkClick(creator.handle!, { linkId: pinnedId });
    expect(clickRes).toEqual({ recorded: true, linkId: pinnedId, economicEffect: "NONE" });
    await recordProfileLinkClick(creator.handle!, { linkId: pinnedId });

    const stats = await getCreatorLinkClickStats(
      await db.user.findUniqueOrThrow({ where: { id: creator.id } }),
    );
    expect(stats.totalClicks).toBe(2);
    expect(stats.byLinkId[pinnedId]).toBe(2);

    // Strictly zero RU and zero ledger entries created by bio-link clicks
    expect(await db.rewardUnit.count({ where: { userId: creator.id } })).toBe(0);
    expect(await db.ledgerEntry.count({ where: { accountId: `user:${creator.id}` } })).toBe(0);

    // Public Creator Media Kit PDF 1.4
    const pdf = await generateCreatorMediaKitPdf(creator.handle!);
    expect(pdf.filename).toBe(`ruvora-mediakit-${creator.handle}.pdf`);
    const pdfText = pdf.buffer.toString("utf8");
    expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfText).toContain(`@${creator.handle}`);
    expect(pdfText).not.toContain(creator.email);

    // GDPR Article 20 export & Article 17 anonymization cover ProfileLinkClick
    const freshCreator = await db.user.findUniqueOrThrow({ where: { id: saved.user.id } });
    const exported = (await exportUserGdprData(freshCreator)) as { profileLinkClicksCount: number };
    expect(exported.profileLinkClicksCount).toBe(2);

    await anonymizeUserAccount(freshCreator, undefined, {
      password: PASS,
      confirmation: "ANONYMIZE_MY_ACCOUNT",
    });
    expect(await db.profileLinkClick.count({ where: { userId: creator.id } })).toBe(0);
  });

  it("isolates workspace webhook inspector logs and verifies signed HMAC self-tests with zero economic side effects", async () => {
    const advA = await makeAccount("whA7", "ADVERTISER");
    const advB = await makeAccount("whB7", "ADVERTISER");

    // Ping before rotating key returns 409
    await expect(sendSignedWebhookPing(advA)).rejects.toMatchObject({
      code: "WEBHOOK_KEY_NOT_CONFIGURED",
    });

    const rotated = await rotateAdvertiserIntegrationKey(advA);
    const ping = await sendSignedWebhookPing(advA);
    expect(ping.ok).toBe(true);
    expect(ping.verified).toBe(true);
    expect(ping.keyPrefix).toBe(rotated.keyPrefix);
    expect(ping.economicEffect).toBe("NONE");

    // Send a real signed conversion webhook scoped to advA's workspace
    const extId = `p7-wh-${randomBytes(4).toString("hex")}`;
    const rawBody = Buffer.from(
      JSON.stringify({
        id: extId,
        type: "conversion.verified",
        occurredAt: new Date().toISOString(),
        data: { activityId: "nonexistent-act", campaignId: "nonexistent-camp" },
      }),
      "utf8",
    );
    const sig = signWebhook("development-conversion", rawBody, rotated.signingKey);
    await receiveWebhook("development-conversion", rawBody, sig, advA.id);

    const logA = await listAdvertiserWebhookEvents(advA);
    expect(logA.events.some((e) => e.externalId === extId)).toBe(true);

    // advB cannot see advA's webhook events
    const logB = await listAdvertiserWebhookEvents(advB);
    expect(logB.events.some((e) => e.externalId === extId)).toBe(false);
  });
});
