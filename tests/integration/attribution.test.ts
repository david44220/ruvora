import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Campaign, Role, User } from "@prisma/client";
import { atomic, db, jsonValue } from "../../src/server/db";
import { hashPassword } from "../../src/server/security/password";
import { DEVELOPMENT_RULES } from "../../src/server/rules";
import {
  createCampaign,
  fundCampaign,
  reviewCampaign,
  submitCampaign,
} from "../../src/server/campaigns";
import { reviewActivity, reverseActivity, submitActivity } from "../../src/server/activities";
import {
  attributionTokenHash,
  bindAttribution,
  getCreatorCampaignEntry,
  getCreatorEventEntry,
  getProfileEntry,
  getReferralEntry,
  startAttribution,
} from "../../src/server/attribution";
import {
  getAdvertiserAnalytics,
  getCreatorAnalytics,
  getGrowthAnalytics,
} from "../../src/server/analytics";
import { balance } from "../../src/server/ledger";
import { getPublicProfile } from "../../src/server/profiles";
import { getDashboard } from "../../src/server/views";

if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe").pathname.endsWith("_test"))
  throw new Error(
    "Attribution integration requires an isolated *_test database; no history is deleted.",
  );
const tag = `attr${randomUUID().replaceAll("-", "").slice(0, 8)}`;
const reason = "Independent review of trusted attribution integration evidence.";
let admin: User,
  advertiser: User,
  creator: User,
  secondCreator: User,
  campaign: Campaign,
  passwordHash: string;
let sequence = 0;
async function makeUser(role: Role = "USER", overrides: Partial<Pick<User, "roles">> = {}) {
  const key = `${tag}_${++sequence}`;
  return db.user.create({
    data: {
      email: `${key}@integration.test`,
      passwordHash,
      displayName: key,
      handle: key,
      roles: role === "USER" ? ["USER"] : ["USER", role],
      country: "FR",
      category: "Design",
      onboarded: true,
      ageEligible: true,
      termsAcceptedAt: new Date(),
      emailVerifiedAt: new Date(),
      followers: role === "CREATOR" ? 50 : 0,
      isDemo: true,
      ...overrides,
    },
  });
}
async function publishRules(change: Partial<typeof DEVELOPMENT_RULES> = {}) {
  return atomic(async (tx) => {
    await tx.economicRule.updateMany({ where: { active: true }, data: { active: false } });
    return tx.economicRule.create({
      data: {
        version: `${tag}-rules-${++sequence}`,
        config: jsonValue({ ...DEVELOPMENT_RULES, ...change }),
      },
    });
  });
}
async function makeCampaign(overrides: Record<string, unknown> = {}, funded = true) {
  const result = await createCampaign(advertiser, {
    name: `${tag} campaign ${++sequence}`,
    description: "Integration campaign",
    objective: "QUALIFIED_VIEW",
    destinationUrl: "https://example.com/trusted",
    budgetMinor: "10000",
    dailyBudgetMinor: "10000",
    unitCostMinor: "25",
    startAt: new Date(Date.now() - 3600000).toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    frequencyCap: 10,
    ...overrides,
  });
  if (funded) {
    await fundCampaign(advertiser, result.campaign.id, {
      amountMinor: "10000",
      idempotencyKey: `${tag}:fund:${sequence}`,
    });
    await submitCampaign(advertiser, result.campaign.id);
    await reviewCampaign(admin, result.campaign.id, { decision: "APPROVE", reason });
  }
  return db.campaign.findUniqueOrThrow({ where: { id: result.campaign.id } });
}
const activityBody = (campaignId = campaign.id) => ({
  campaignId,
  type: "QUALIFIED_VIEW",
  idempotencyKey: `${tag}:activity:${++sequence}`,
  evidence: "Trusted integration evidence for independent validation.",
});
async function boundProfile(user?: User) {
  const entry = await getProfileEntry(creator.handle!);
  const tokens = await startAttribution(entry.slug);
  const participant = user ?? (await makeUser());
  await bindAttribution(participant, tokens, { registration: !user });
  return { participant, tokens };
}
async function referred(referrer: User) {
  const entry = await getReferralEntry(referrer.handle!);
  const tokens = await startAttribution(entry.slug);
  const participant = await makeUser();
  await bindAttribution(participant, tokens, { registration: true });
  return { participant, tokens };
}
async function validate(activityId: string) {
  return reviewActivity(admin, activityId, {
    decision: "VALIDATE",
    reason,
    evidenceVerified: true,
  });
}

beforeAll(async () => {
  process.env.APP_ENV = "development";
  process.env.ALLOW_DEMO_FUNDING = "true";
  passwordHash = await hashPassword("unused-integration-only-passphrase");
  await publishRules();
  admin = await makeUser("ADMIN");
  advertiser = await makeUser("ADVERTISER");
  creator = await makeUser("CREATOR");
  secondCreator = await makeUser("CREATOR");
  campaign = await makeCampaign();
});
afterAll(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("trusted attribution and direct referral persistence", () => {
  it("creates no RU or money from entry visits, registration, or campaign funding", async () => {
    const referrer = await makeUser("CREATOR");
    const { participant, tokens } = await referred(referrer);
    const context = await db.attributionContext.findUniqueOrThrow({
      where: { tokenHash: attributionTokenHash(tokens.attributionToken) },
    });
    expect(context.tokenHash).not.toBe(tokens.attributionToken);
    expect(context.visitorHash).not.toBe(tokens.visitorToken);
    expect(context.boundUserId).toBe(participant.id);
    expect(context.creatorId).toBe(referrer.id);
    expect(
      await db.rewardUnit.count({
        where: { userId: { in: [referrer.id, participant.id, advertiser.id] } },
      }),
    ).toBe(0);
    expect(await db.referral.findUnique({ where: { inviteeId: participant.id } })).toMatchObject({
      inviterId: referrer.id,
      state: "PENDING",
      attributionId: context.id,
    });
    expect(await balance(db, `campaign:${campaign.id}`)).toBe(10000n);
  });
  it("binds a profile origin to activity, then credits only its trusted creator once", async () => {
    const { participant, tokens } = await boundProfile();
    const body = activityBody();
    const { activity } = await submitActivity(participant, body, tokens);
    expect(activity.creatorId).toBe(creator.id);
    expect(activity.attributionId).toBeTruthy();
    expect(activity.attributionSnapshot).toMatchObject({
      creatorId: creator.id,
      boundUserId: participant.id,
      source: "CREATOR_PROFILE",
    });
    expect(await db.rewardUnit.count({ where: { activityId: activity.id } })).toBe(0);
    const results = await Promise.all([validate(activity.id), validate(activity.id)]);
    expect(results.every((result) => result.activity.state === "VALIDATED")).toBe(true);
    const units = await db.rewardUnit.findMany({ where: { activityId: activity.id } });
    expect(units.map((unit) => unit.category).sort()).toEqual(["ADVERTISER", "CREATOR", "USER"]);
    expect(units.find((unit) => unit.category === "CREATOR")?.userId).toBe(creator.id);
    expect(
      await db.ledgerTransaction.count({ where: { idempotencyKey: `activity:${activity.id}` } }),
    ).toBe(1);
  });
  it("explicit same-creator referral after a profile visit preserves origin and one observed session", async () => {
    const origin = await getProfileEntry(creator.handle!);
    const referral = await getReferralEntry(creator.handle!);
    const before = await getCreatorAnalytics(creator);
    const original = await startAttribution(origin.slug);
    const upgraded = await startAttribution(referral.slug, original);
    expect(upgraded.expiresAt).toEqual(original.expiresAt);
    expect(upgraded.attributionToken === original.attributionToken).toBe(false);
    const after = await getCreatorAnalytics(creator);
    expect(after.summary.attributedSessions).toBe(before.summary.attributedSessions + 1);
    const participant = await makeUser();
    const bound = await bindAttribution(participant, upgraded, { registration: true });
    expect(bound.referralCreated).toBe(true);
    const relationship = await db.referral.findUniqueOrThrow({
      where: { inviteeId: participant.id },
    });
    expect(relationship.inviterId).toBe(creator.id);
    await expect(bindAttribution(participant, original)).rejects.toMatchObject({
      code: "ATTRIBUTION_EXPIRED",
    });
    const pending = await submitActivity(participant, activityBody(), upgraded);
    await validate(pending.activity.id);
    expect(
      await db.rewardUnit.count({
        where: { activityId: pending.activity.id, category: "REFERRAL", userId: creator.id },
      }),
    ).toBe(1);
  });
  it("rejects financially trusted creator fields from clients", async () => {
    const participant = await makeUser();
    await expect(
      submitActivity(participant, { ...activityBody(), creatorHandle: creator.handle }),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      submitActivity(participant, { ...activityBody(), creatorId: creator.id }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
  it("rejects forged bearer or anonymous-binding tokens without creating activity", async () => {
    const { participant, tokens } = await boundProfile();
    for (const changed of [
      { ...tokens, attributionToken: "x".repeat(43) },
      { ...tokens, visitorToken: "y".repeat(43) },
      { attributionToken: tokens.attributionToken },
    ])
      await expect(submitActivity(participant, activityBody(), changed)).rejects.toMatchObject({
        code: "ATTRIBUTION_TOKEN_INVALID",
      });
    expect(await db.activity.count({ where: { userId: participant.id } })).toBe(0);
  });
  it("rejects reuse across authenticated accounts and self attribution", async () => {
    const { participant, tokens } = await boundProfile();
    const other = await makeUser();
    await expect(bindAttribution(other, tokens)).rejects.toMatchObject({
      code: "ATTRIBUTION_ACCOUNT_MISMATCH",
    });
    await expect(submitActivity(other, activityBody(), tokens)).rejects.toMatchObject({
      code: "ATTRIBUTION_ACCOUNT_MISMATCH",
    });
    const entry = await getProfileEntry(creator.handle!);
    const own = await startAttribution(entry.slug);
    await expect(bindAttribution(creator, own)).rejects.toMatchObject({ code: "SELF_ATTRIBUTION" });
    expect(
      (
        await db.attributionContext.findUniqueOrThrow({
          where: { tokenHash: attributionTokenHash(tokens.attributionToken) },
        })
      ).boundUserId,
    ).toBe(participant.id);
  });
  it("keeps the first eligible creator and original expiry across later touches", async () => {
    const first = await getProfileEntry(creator.handle!),
      later = await getProfileEntry(secondCreator.handle!);
    const tokens = await startAttribution(first.slug);
    const next = await startAttribution(later.slug, tokens);
    expect(next.attributionToken).toBe(tokens.attributionToken);
    expect(next.expiresAt).toEqual(tokens.expiresAt);
    const participant = await makeUser();
    await bindAttribution(participant, next, { registration: true });
    const result = await submitActivity(participant, activityBody(), next);
    expect(result.activity.creatorId).toBe(creator.id);
  });
  it("rejects altered evidence or cookie context on an idempotency replay", async () => {
    const { participant, tokens } = await boundProfile();
    const body = activityBody();
    const first = await submitActivity(participant, body, tokens);
    expect((await submitActivity(participant, body, tokens)).activity.id).toBe(first.activity.id);
    await expect(
      submitActivity(participant, { ...body, evidence: "Changed integration evidence" }, tokens),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(submitActivity(participant, body)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
  it("enforces campaign and event destination restrictions", async () => {
    const otherCampaign = await makeCampaign();
    const entry = await getCreatorCampaignEntry(creator.handle!, campaign.id);
    const tokens = await startAttribution(entry.slug);
    const participant = await makeUser();
    await bindAttribution(participant, tokens);
    await expect(
      submitActivity(participant, activityBody(otherCampaign.id), tokens),
    ).rejects.toMatchObject({ code: "ATTRIBUTION_CAMPAIGN_MISMATCH" });
    const event = await db.event.create({
      data: {
        slug: `${tag}-event`,
        title: "Attribution event",
        description: "Integration",
        startAt: new Date(Date.now() - 1000),
        endAt: new Date(Date.now() + 3600000),
        rules: { freeEntry: true },
        isDemo: true,
      },
    });
    const eventEntry = await getCreatorEventEntry(creator.handle!, event.id);
    const eventTokens = await startAttribution(eventEntry.slug);
    await bindAttribution(participant, eventTokens);
    await expect(submitActivity(participant, activityBody(), eventTokens)).rejects.toMatchObject({
      code: "ATTRIBUTION_EVENT_MISMATCH",
    });
  });
  it("rejects expired submission but accepts captured activity reviewed after cookie expiry", async () => {
    await publishRules({ attribution: { ...DEVELOPMENT_RULES.attribution, windowSeconds: 60 } });
    const { participant, tokens } = await boundProfile();
    const pending = await submitActivity(participant, activityBody(), tokens);
    await publishRules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(tokens.expiresAt);
    try {
      await expect(submitActivity(participant, activityBody(), tokens)).rejects.toMatchObject({
        code: "ATTRIBUTION_EXPIRED",
      });
      expect((await validate(pending.activity.id)).activity.state).toBe("VALIDATED");
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps frozen context limits under new rules and serializes competing submissions", async () => {
    await publishRules({
      attribution: { ...DEVELOPMENT_RULES.attribution, maxActivitiesPerContext: 1 },
    });
    const { participant, tokens } = await boundProfile();
    await publishRules();
    const results = await Promise.allSettled([
      submitActivity(participant, activityBody(), tokens),
      submitActivity(participant, activityBody(), tokens),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.activity.count({ where: { userId: participant.id } })).toBe(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.code).toBe("ATTRIBUTION_USAGE_LIMIT");
  });
  it("rechecks creator eligibility, additional campaign targeting, and escrow", async () => {
    const { participant, tokens } = await boundProfile();
    const pending = await submitActivity(participant, activityBody(), tokens);
    await db.user.update({ where: { id: creator.id }, data: { suspended: true } });
    try {
      await expect(validate(pending.activity.id)).rejects.toMatchObject({
        code: "CREATOR_INELIGIBLE",
      });
    } finally {
      await db.user.update({ where: { id: creator.id }, data: { suspended: false } });
    }
    const restricted = await makeCampaign({
      minimumCreatorFollowers: 100,
      creatorCategories: ["Music"],
    });
    await expect(getCreatorCampaignEntry(creator.handle!, restricted.id)).rejects.toMatchObject({
      code: "CREATOR_CAMPAIGN_INELIGIBLE",
    });
    const region = await makeCampaign({ allowedCountries: ["BE"] });
    await expect(submitActivity(participant, activityBody(region.id))).rejects.toMatchObject({
      code: "CAMPAIGN_REGION_INELIGIBLE",
    });
    const empty = await makeCampaign({}, false);
    await db.campaign.update({ where: { id: empty.id }, data: { state: "ACTIVE" } });
    await expect(getCreatorCampaignEntry(creator.handle!, empty.id)).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });
  });
  it("creates one bounded referral award from validated USER RU and reverses every reward category", async () => {
    const referrer = await makeUser("CREATOR");
    const { participant, tokens } = await referred(referrer);
    const pending = await submitActivity(participant, activityBody(), tokens);
    await validate(pending.activity.id);
    await validate(pending.activity.id);
    const credits = await db.referralCredit.findMany({
      where: { activityId: pending.activity.id },
    });
    expect(credits).toHaveLength(1);
    expect(credits[0].amountMicros).toBe(25000n);
    expect(
      (await db.rewardUnit.findMany({ where: { activityId: pending.activity.id } }))
        .map((unit) => unit.category)
        .sort(),
    ).toEqual(["ADVERTISER", "CREATOR", "REFERRAL", "USER"]);
    await reverseActivity(admin, pending.activity.id, { reason });
    expect(
      (await db.rewardUnit.findMany({ where: { activityId: pending.activity.id } })).every(
        (unit) => unit.state === "REVERSED",
      ),
    ).toBe(true);
    expect(await db.referralCredit.count({ where: { activityId: pending.activity.id } })).toBe(1);
    expect(
      (
        await db.xpEntry.aggregate({
          where: { activityId: pending.activity.id },
          _sum: { amount: true },
        })
      )._sum.amount,
    ).toBe(0);
  });
  it("serializes caps across referees and does not free referral capacity after reversal", async () => {
    await publishRules({
      referral: { ...DEVELOPMENT_RULES.referral, maxRewardPerReferrerPeriodMicros: 25000n },
    });
    const referrer = await makeUser("CREATOR");
    const first = await referred(referrer),
      second = await referred(referrer);
    await publishRules();
    const a = await submitActivity(first.participant, activityBody(), first.tokens),
      b = await submitActivity(second.participant, activityBody(), second.tokens);
    await Promise.all([validate(a.activity.id), validate(b.activity.id)]);
    const credits = await db.referralCredit.findMany({
      where: { referral: { inviterId: referrer.id } },
    });
    expect(credits).toHaveLength(1);
    expect(credits[0].amountMicros).toBe(25000n);
    await reverseActivity(admin, credits[0].activityId, { reason });
    const another = await submitActivity(first.participant, activityBody(), first.tokens);
    await validate(another.activity.id);
    expect(await db.referralCredit.count({ where: { referral: { inviterId: referrer.id } } })).toBe(
      1,
    );
  });
  it("rejects beneficiary-admin review, referral rebinding, and old-account recruitment", async () => {
    const referrer = await makeUser("CREATOR", { roles: ["USER", "CREATOR", "ADMIN"] });
    const { participant, tokens } = await referred(referrer);
    const pending = await submitActivity(participant, activityBody(), tokens);
    await expect(
      reviewActivity(referrer, pending.activity.id, {
        decision: "VALIDATE",
        reason,
        evidenceVerified: true,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_CONFLICT" });
    const otherEntry = await getReferralEntry(secondCreator.handle!),
      otherTokens = await startAttribution(otherEntry.slug);
    await expect(
      bindAttribution(participant, otherTokens, { registration: true }),
    ).rejects.toMatchObject({ code: "REFERRAL_ACCOUNT_EXISTS" });
    await validate(pending.activity.id);
    await expect(reverseActivity(referrer, pending.activity.id, { reason })).rejects.toMatchObject({
      code: "REVIEW_CONFLICT",
    });
  });
  it("blocks referral self-farming by an advertiser and suspended referrers", async () => {
    const own = await getReferralEntry(advertiser.handle!);
    const ownTokens = await startAttribution(own.slug);
    const participant = await makeUser();
    await bindAttribution(participant, ownTokens, { registration: true });
    await expect(submitActivity(participant, activityBody(), ownTokens)).rejects.toMatchObject({
      code: "SELF_REFERRAL",
    });
    const referrer = await makeUser();
    const referral = await referred(referrer);
    const pending = await submitActivity(referral.participant, activityBody(), referral.tokens);
    await db.user.update({ where: { id: referrer.id }, data: { economicHold: true } });
    await validate(pending.activity.id);
    expect(
      await db.rewardUnit.count({
        where: { activityId: pending.activity.id, category: "REFERRAL" },
      }),
    ).toBe(0);
  });
  it("revoked referral origin cannot grant new direct credits on later direct activity", async () => {
    const referrer = await makeUser();
    const { participant } = await referred(referrer);
    const relation = await db.referral.findUniqueOrThrow({ where: { inviteeId: participant.id } });
    await db.attributionContext.update({
      where: { id: relation.attributionId! },
      data: { status: "REVOKED" },
    });
    const pending = await submitActivity(participant, activityBody());
    await validate(pending.activity.id);
    expect(await db.referralCredit.count({ where: { activityId: pending.activity.id } })).toBe(0);
  });
  it("protects stored context, activity snapshots, and referral credit history", async () => {
    const { participant, tokens } = await boundProfile();
    const pending = await submitActivity(participant, activityBody(), tokens);
    await expect(
      db.attributionContext.update({
        where: { id: pending.activity.attributionId! },
        data: { creatorId: secondCreator.id },
      }),
    ).rejects.toThrow();
    await expect(
      db.activity.update({
        where: { id: pending.activity.id },
        data: { attributionSnapshot: { creatorId: secondCreator.id } },
      }),
    ).rejects.toThrow();
    const credit = await db.referralCredit.findFirstOrThrow({
      where: { referral: { inviter: { email: { contains: tag } } } },
    });
    await expect(
      db.referralCredit.update({ where: { id: credit.id }, data: { amountMicros: 1n } }),
    ).rejects.toThrow();
  });
  it("reports actual attributed sessions, actions, reward states and advertiser spend", async () => {
    const before = await getCreatorAnalytics(creator);
    const context = await boundProfile();
    const entry = await getCreatorCampaignEntry(creator.handle!, campaign.id);
    await startAttribution(entry.slug, context.tokens, context.participant);
    const pending = await submitActivity(context.participant, activityBody(), context.tokens);
    await validate(pending.activity.id);
    const after = await getCreatorAnalytics(creator);
    expect(after.summary.attributedSessions).toBe(before.summary.attributedSessions + 1);
    expect(after.summary.validatedActions).toBe(before.summary.validatedActions + 1);
    expect(after.summary.creatorRuMicros).toBeGreaterThan(before.summary.creatorRuMicros);
    expect(after.summary.pendingCreatorRuMicros).toBe(0n);
    const advertiserStats = await getAdvertiserAnalytics(advertiser);
    const validatedSpend =
      (
        await db.activity.aggregate({
          where: { campaign: { advertiserId: advertiser.id }, state: "VALIDATED" },
          _sum: { billableMinor: true },
        })
      )._sum.billableMinor ?? 0n;
    expect(advertiserStats.summary.netSpendMinor).toBe(validatedSpend);
    expect(
      advertiserStats.summary.grossSpendMinor - advertiserStats.summary.reversedSpendMinor,
    ).toBe(validatedSpend);
    const growth = await getGrowthAnalytics(admin);
    expect(growth.summary.creatorRegistrations).toBeGreaterThan(0);
    expect(growth.topCreators.some((row) => row.handle === creator.handle)).toBe(true);
    await expect(getCreatorAnalytics(context.participant)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("public profiles hide unlisted events and member dashboards omit private review metadata", async () => {
    const member = await makeUser("CREATOR");
    const internalEvidence = `private-event-evidence-${tag}`;
    const events = [];
    for (const visibility of ["PUBLIC", "UNLISTED"] as const)
      events.push(
        await db.event.create({
          data: {
            slug: `${tag}-privacy-${visibility.toLowerCase()}`,
            title: `${visibility} profile event`,
            description: "Public participation description.",
            visibility,
            state: "ACTIVE",
            startAt: new Date(Date.now() - 60000),
            endAt: new Date(Date.now() + 3600000),
            rules: { freeEntry: true },
            ownerId: advertiser.id,
            sponsorId: advertiser.id,
            hostId: secondCreator.id,
            reviewedById: admin.id,
            reviewedAt: new Date(),
            reviewReason: internalEvidence,
            approvedSnapshot: { internalEvidence, ownerId: advertiser.id, reviewedById: admin.id },
            isDemo: true,
            memberships: { create: { userId: member.id } },
          },
        }),
      );
    const visible = events.find((event) => event.visibility === "PUBLIC")!;
    const unlisted = events.find((event) => event.visibility === "UNLISTED")!;
    const profile = await getPublicProfile(member.handle!);
    expect(profile.events.map((event) => event.id)).toEqual([visible.id]);
    expect(profile.trackedEvents).not.toHaveProperty(unlisted.id);
    const serializedProfile = JSON.stringify(jsonValue(profile));
    expect(serializedProfile).not.toContain(unlisted.id);
    expect(serializedProfile).not.toContain(unlisted.slug);
    expect(serializedProfile).not.toContain(internalEvidence);
    const dashboard = await getDashboard(member);
    expect(dashboard.events.map((event) => event.id).sort()).toEqual(
      [visible.id, unlisted.id].sort(),
    );
    for (const event of [...profile.events, ...dashboard.events]) {
      expect(event).toMatchObject({ title: expect.any(String), rules: { freeEntry: true } });
      for (const key of [
        "approvedSnapshot",
        "reviewReason",
        "reviewedById",
        "reviewedBy",
        "reviewedAt",
        "ownerId",
        "sponsorId",
        "hostId",
        "owner",
        "reviewer",
      ])
        expect(event).not.toHaveProperty(key);
      expect(JSON.stringify(jsonValue(event))).not.toContain(internalEvidence);
    }
  });
  it("rejects development attribution in staging even with a nonproduction Node runtime", async () => {
    const { participant, tokens } = await boundProfile();
    vi.stubEnv("APP_ENV", "staging");
    try {
      await expect(bindAttribution(participant, tokens)).rejects.toMatchObject({
        code: "DEMO_PRODUCTION_BLOCKED",
      });
      await expect(getProfileEntry(creator.handle!)).rejects.toMatchObject({
        code: "CREATOR_INELIGIBLE",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
