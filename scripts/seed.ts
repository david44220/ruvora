import "dotenv/config";
import { z } from "zod";
import { db, atomic, jsonValue } from "../src/server/db";
import { hashPassword } from "../src/server/security/password";
import { DEVELOPMENT_RULES } from "../src/server/rules";
import {
  createCampaign,
  fundCampaign,
  submitCampaign,
  reviewCampaign,
} from "../src/server/campaigns";
import { submitActivity, reviewActivity } from "../src/server/activities";
import { joinEvent } from "../src/server/events";
import { getProfileEntry, startAttribution, bindAttribution } from "../src/server/attribution";
import { seedDevelopmentMfa } from "../src/server/security/mfa";
import { isDevelopment } from "../src/server/environment";
import { decodeBase32 } from "../src/server/security/totp";
import { sealSecret } from "../src/server/security/crypto";

if (!isDevelopment() || process.env.ALLOW_DEV_SEED !== "true")
  throw new Error("Development seed requires ALLOW_DEV_SEED=true and is forbidden in production.");
if (process.env.ALLOW_DEMO_FUNDING !== "true")
  throw new Error("Seed requires explicit ALLOW_DEMO_FUNDING=true; no real funds are collected.");
const password = z.string().min(12).max(128).parse(process.env.DEMO_PASSWORD);
decodeBase32(z.string().parse(process.env.DEMO_TOTP_SECRET));
sealSecret("preflight", "development-seed");
const passwordHash = await hashPassword(password);
const now = Date.now();
try {
  await atomic(async (tx) => {
    if (!(await tx.economicRule.findUnique({ where: { version: "development-pass02-v1" } }))) {
      await tx.economicRule.updateMany({ where: { active: true }, data: { active: false } });
      await tx.economicRule.create({
        data: { version: "development-pass02-v1", config: jsonValue(DEVELOPMENT_RULES) },
      });
      await tx.auditLog.create({
        data: {
          action: "DEVELOPMENT_RULES_VERSION_CREATED",
          targetId: "development-pass02-v1",
          details: { isDemo: true, existingEconomicHistoryPreserved: true },
        },
      });
    }
    const people = [
      {
        handle: "mira",
        displayName: "Mira Laurent",
        email: "mira@ruvora.test",
        roles: ["USER", "CREATOR"] as const,
        followers: 1540,
        category: "Lifestyle & design",
        bio: "A little design. A little everyday magic. Building something that feels like me.",
        socialLinks: [
          { platform: "Instagram", url: "https://www.instagram.com/", followers: 1540 },
          { platform: "TikTok", url: "https://www.tiktok.com/", followers: 820 },
        ],
        customLinks: [
          { title: "My creative journal", url: "https://www.behance.net/" },
          { title: "Things I love", url: "https://www.pinterest.com/" },
        ],
      },
      {
        handle: "alex",
        displayName: "Alex Morgan",
        email: "alex@ruvora.test",
        roles: ["USER"] as const,
        followers: 24,
        category: "Curious by nature",
        bio: "Discovering independent creators and meaningful experiences.",
        socialLinks: [],
        customLinks: [],
      },
      {
        handle: "leon",
        displayName: "Léon Moreau",
        email: "leon@ruvora.test",
        roles: ["USER", "CREATOR"] as const,
        followers: 48,
        category: "Photography",
        bio: "Small audience. Big ideas. Finding beauty in ordinary places.",
        socialLinks: [{ platform: "Instagram", url: "https://www.instagram.com/", followers: 48 }],
        customLinks: [],
      },
      {
        handle: "nora",
        displayName: "Nora Park",
        email: "nora@ruvora.test",
        roles: ["USER", "CREATOR"] as const,
        followers: 12800,
        category: "Travel & culture",
        bio: "Stories from the places in between.",
        socialLinks: [{ platform: "YouTube", url: "https://www.youtube.com/", followers: 12800 }],
        customLinks: [],
      },
      {
        handle: "studio",
        displayName: "Forma Studio",
        email: "studio@ruvora.test",
        roles: ["USER", "ADVERTISER"] as const,
        followers: 2500,
        category: "Independent brand",
        bio: "Objects and ideas for considered living.",
        socialLinks: [],
        customLinks: [{ title: "Discover design", url: "https://www.behance.net/" }],
      },
      {
        handle: "ruvora_admin",
        displayName: "Ruvora Operations",
        email: "admin@ruvora.test",
        roles: ["USER", "ADMIN"] as const,
        followers: 0,
        category: "Operations",
        bio: "Development administration account.",
        socialLinks: [],
        customLinks: [],
      },
      {
        handle: "ruvora_reviewer",
        displayName: "Ruvora Independent Reviewer",
        email: "demo-admin-reviewer@ruvora.test",
        roles: ["USER", "ADMIN"] as const,
        followers: 0,
        category: "Operations",
        bio: "Independent development approval account.",
        socialLinks: [],
        customLinks: [],
      },
    ];
    for (const person of people) {
      const existing = await tx.user.findUnique({ where: { email: person.email } });
      if (existing && !existing.isDemo) throw new Error("Refusing to replace a non-demo account.");
      if (!existing)
        await tx.user.create({
          data: {
            ...person,
            roles: [...person.roles],
            passwordHash,
            isDemo: true,
            onboarded: true,
            ageEligible: true,
            termsAcceptedAt: new Date(now),
            emailVerifiedAt: new Date(now),
            country: "FR",
            locale: "en",
            socialLinks: jsonValue(person.socialLinks),
            customLinks: jsonValue(person.customLinks),
          },
        });
    }
    if (!(await tx.event.findUnique({ where: { slug: "creator-rush" } })))
      await tx.event.create({
        data: {
          id: "demo-event-creator-rush",
          slug: "creator-rush",
          title: "Creator Rush",
          description:
            "A new wave of independent creators. Discover thoughtful brands, take part in reviewed campaign experiences, and grow together.",
          artwork: "/assets/events/ruvora-event.webp",
          sponsor: "Forma Studio",
          startAt: new Date(now - 3 * 86400000),
          endAt: new Date(now + 21 * 86400000),
          rules: {
            en: "Free entry. Join before participating. Event Points are granted only after an independent administrator validates eligible linked campaign activity. Daily campaign limits apply. Reversed activity loses its points. Rankings use points, then earliest attainment, then account ID. No cash prize is offered in this development event.",
            fr: "Participation gratuite. Rejoignez l'événement avant de participer. Les points sont attribués après validation indépendante d'une activité éligible. Limites quotidiennes applicables. Une activité annulée perd ses points. Classement par points, puis date d'obtention et identifiant. Aucun prix en argent dans cet événement de développement.",
          },
          isDemo: true,
        },
      });
  });
  const advertiser = await db.user.findUniqueOrThrow({ where: { email: "studio@ruvora.test" } });
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@ruvora.test" } });
  const reviewer = await db.user.findUniqueOrThrow({
    where: { email: "demo-admin-reviewer@ruvora.test" },
  });
  await seedDevelopmentMfa(admin.id);
  await seedDevelopmentMfa(reviewer.id);
  let campaign = await db.campaign.findFirst({
    where: { name: "Objects with a story", advertiserId: advertiser.id },
  });
  if (!campaign)
    campaign = (
      await createCampaign(advertiser, {
        name: "Objects with a story",
        description:
          "Discover the design story behind an independent studio. Share thoughtful feedback for manual review.",
        objective: "QUALIFIED_VIEW",
        destinationUrl: "https://www.behance.net/",
        budgetMinor: "200000",
        dailyBudgetMinor: "10000",
        unitCostMinor: "25",
        startAt: new Date(now - 86400000).toISOString(),
        endAt: new Date(now + 20 * 86400000).toISOString(),
        eventId: "demo-event-creator-rush",
        frequencyCap: 3,
      })
    ).campaign;
  await fundCampaign(advertiser, campaign.id, {
    amountMinor: "200000",
    idempotencyKey: "development-seed-funding-v1",
  });
  if (campaign.state === "DRAFT") await submitCampaign(advertiser, campaign.id);
  campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  if (campaign.state === "PENDING_REVIEW")
    await reviewCampaign(admin, campaign.id, {
      decision: "APPROVE",
      reason:
        "Development seed: independent review of a sample campaign; no real advertising claims.",
    });
  for (const email of [
    "alex@ruvora.test",
    "mira@ruvora.test",
    "leon@ruvora.test",
    "nora@ruvora.test",
  ]) {
    const participant = await db.user.findUniqueOrThrow({ where: { email } });
    await joinEvent(participant, "demo-event-creator-rush");
    for (let index = 0; index < 2; index++) {
      const key = `development-seed-activity-${index}`;
      // Repeated seeds preserve all previous economic results and legacy provenance.
      if (await db.activity.findUnique({ where: { idempotencyKey: `${participant.id}:${key}` } }))
        continue;
      const entry = await getProfileEntry(participant.handle === "mira" ? "leon" : "mira");
      const attribution = await startAttribution(entry.slug);
      await bindAttribution(participant, attribution);
      const result = await submitActivity(
        participant,
        {
          campaignId: campaign.id,
          type: "QUALIFIED_VIEW",
          eventId: "demo-event-creator-rush",
          idempotencyKey: key,
          evidence:
            "Development example: participant reviewed the sample design story and supplied feedback. Not a live advertising outcome.",
        },
        attribution,
      );
      if (result.activity.state === "PENDING_VALIDATION")
        await reviewActivity(admin, result.activity.id, {
          decision: "VALIDATE",
          reason:
            "Development seed: sample evidence reviewed to exercise accounting and progression; not a real advertising outcome.",
          evidenceVerified: true,
        });
    }
  }
  const pendingUser = await db.user.findUniqueOrThrow({ where: { email: "alex@ruvora.test" } });
  if (
    !(await db.activity.findUnique({
      where: { idempotencyKey: `${pendingUser.id}:development-pending-review-v1` },
    }))
  ) {
    const entry = await getProfileEntry("mira");
    const attribution = await startAttribution(entry.slug);
    await bindAttribution(pendingUser, attribution);
    await submitActivity(
      pendingUser,
      {
        campaignId: campaign.id,
        type: "QUALIFIED_VIEW",
        eventId: "demo-event-creator-rush",
        idempotencyKey: "development-pending-review-v1",
        evidence:
          "Development example waiting for administrator review. No RU, XP, Event Points or spend has been generated.",
      },
      attribution,
    );
  }
  console.log(
    "Development seed complete. All example accounts, campaigns and accounting are marked demo. No real funds, advertising outcomes or payouts.",
  );
  console.log(
    "Accounts: alex@ruvora.test, mira@ruvora.test, leon@ruvora.test, nora@ruvora.test, studio@ruvora.test, admin@ruvora.test, demo-admin-reviewer@ruvora.test. Password: the DEMO_PASSWORD you supplied; never logged.",
  );
} finally {
  await db.$disconnect();
}
