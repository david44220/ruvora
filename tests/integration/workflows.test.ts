import "dotenv/config";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { User, Campaign } from "@prisma/client";
import { db, atomic, jsonValue } from "../../src/server/db";
import { register, login, logout, userFromToken, limitRate } from "../../src/server/auth";
import { hashPassword } from "../../src/server/security/password";
import { saveProfile } from "../../src/server/profiles";
import { DEVELOPMENT_RULES } from "../../src/server/rules";
import {
  createCampaign,
  fundCampaign,
  submitCampaign,
  reviewCampaign,
  listCampaigns,
} from "../../src/server/campaigns";
import { submitActivity, reviewActivity, reverseActivity } from "../../src/server/activities";
import { joinEvent, getEvent } from "../../src/server/events";
import { createDistributionPreview, commitDistribution } from "../../src/server/distributions";
import { getAdmin, setAccountHold, updateEconomicRules } from "../../src/server/views";
import { account, balance } from "../../src/server/ledger";

const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!testUrl.pathname.endsWith("_test"))
  throw new Error(
    "Integration tests require DATABASE_URL to name an isolated *_test database. No reset/delete operation is performed.",
  );
const tag = randomUUID().replaceAll("-", "").slice(0, 10);
const periodStart = new Date().toISOString();
const password = "integration-only-passphrase";
let participant: User, creator: User, advertiser: User, admin: User, campaign: Campaign;
let eventId: string, activityId: string, reversibleActivityId: string;
const longReason = "Independent integration review of supplied campaign evidence.";
const signup = async (role: "USER" | "CREATOR" | "ADVERTISER", key: string) => {
  const result = await register({
    email: `${key}-${tag}@integration.test`,
    password,
    displayName: `Integration ${key}`,
    role,
  });
  let user = await db.user.findUniqueOrThrow({ where: { id: result.user.id } });
  await saveProfile(user, {
    handle: `${key}_${tag}`,
    displayName: `Integration ${key}`,
    bio: "Integration fixture",
    category: "Design",
    locale: "en",
    country: "FR",
    ageEligible: true,
    termsAccepted: true,
    socials:
      role === "CREATOR"
        ? [{ platform: "Example", url: "https://example.com/creator", followers: 10 }]
        : [],
    links: [],
  });
  user = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return user;
};
beforeAll(async () => {
  process.env.ALLOW_DEMO_FUNDING = "true";
  await atomic(async (tx) => {
    await tx.economicRule.updateMany({ where: { active: true }, data: { active: false } });
    await tx.economicRule.create({
      data: { version: `integration-${tag}`, config: jsonValue(DEVELOPMENT_RULES) },
    });
  });
  participant = await signup("USER", "user");
  creator = await signup("CREATOR", "creator");
  advertiser = await signup("ADVERTISER", "advertiser");
  admin = await db.user.create({
    data: {
      email: `admin-${tag}@integration.test`,
      passwordHash: await hashPassword(password),
      displayName: "Integration administrator",
      roles: ["USER", "ADMIN"],
    },
  });
  const now = Date.now();
  const event = await db.event.create({
    data: {
      slug: `test-event-${tag}`,
      title: "Integration event",
      description: "Free entry; tested validated points",
      startAt: new Date(now - 3600000),
      endAt: new Date(now + 86400000),
      rules: { freeEntry: true },
      isDemo: true,
    },
  });
  eventId = event.id;
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("PostgreSQL economic and identity integration", () => {
  it("issues opaque hashed sessions, authenticates, expires and logs out", async () => {
    const result = await login({ email: participant.email, password });
    const rows = await db.session.findMany({ where: { userId: participant.id } });
    expect(rows.some((row) => row.tokenHash === result.session.token)).toBe(false);
    expect((await userFromToken(result.session.token))?.id).toBe(participant.id);
    await logout(result.session.token);
    expect(await userFromToken(result.session.token)).toBeNull();
    await expect(
      login({ email: participant.email, password: "incorrect-passphrase" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const expired = await login({ email: participant.email, password });
    await db.session.updateMany({
      where: { userId: participant.id },
      data: { expiresAt: new Date(0) },
    });
    expect(await userFromToken(expired.session.token)).toBeNull();
  });
  it("persists rate limits and rejects unprivileged administration", async () => {
    await limitRate("test", tag, 1, 300);
    await expect(limitRate("test", tag, 1, 300)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(getAdmin(creator)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createCampaign(participant, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("creates campaign escrow, enforces owner and total budget, never grants RU for deposits", async () => {
    campaign = (
      await createCampaign(advertiser, {
        name: `Integration ${tag}`,
        objective: "QUALIFIED_VIEW",
        destinationUrl: "https://example.com/story",
        budgetMinor: "500",
        dailyBudgetMinor: "100",
        unitCostMinor: "25",
        startAt: new Date(Date.now() - 1800000).toISOString(),
        endAt: new Date(Date.now() + 7200000).toISOString(),
        eventId,
        frequencyCap: 3,
      })
    ).campaign;
    await expect(
      fundCampaign({ ...participant, roles: ["USER", "ADVERTISER"] }, campaign.id, {
        amountMinor: "500",
        idempotencyKey: `${tag}:fund`,
      }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await fundCampaign(advertiser, campaign.id, {
      amountMinor: "500",
      idempotencyKey: `${tag}:fund`,
    });
    await fundCampaign(advertiser, campaign.id, {
      amountMinor: "500",
      idempotencyKey: `${tag}:fund`,
    });
    expect(await balance(db, `campaign:${campaign.id}`)).toBe(500n);
    expect(await db.rewardUnit.count({ where: { userId: advertiser.id } })).toBe(0);
    await expect(
      fundCampaign(advertiser, campaign.id, {
        amountMinor: "1",
        idempotencyKey: `${tag}:too-much`,
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    await expect(
      fundCampaign(advertiser, campaign.id, { amountMinor: "400", idempotencyKey: `${tag}:fund` }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await submitCampaign(advertiser, campaign.id);
    await expect(
      reviewCampaign({ ...advertiser, roles: ["USER", "ADVERTISER", "ADMIN"] }, campaign.id, {
        decision: "APPROVE",
        reason: longReason,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_CONFLICT" });
    await reviewCampaign(admin, campaign.id, { decision: "APPROVE", reason: longReason });
  });
  it("public opportunities omit internal review notes, identifiers and financial budgets", async () => {
    const publicList = await listCampaigns();
    const item = publicList.campaigns.find((row) => row.id === campaign.id);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty("reviewReason");
    expect(item).not.toHaveProperty("advertiserId");
    expect(item).not.toHaveProperty("budgetMinor");
    expect(item).not.toHaveProperty("remainingMinor");
    expect(item?.canParticipate).toBe(true);
    expect(
      (await listCampaigns(advertiser)).campaigns.find((row) => row.id === campaign.id),
    ).toHaveProperty("budgetMinor", 500n);
  });
  it("requires event membership, protects self participation and remains pending before review", async () => {
    await expect(
      submitActivity(advertiser, {
        campaignId: campaign.id,
        type: "QUALIFIED_VIEW",
        idempotencyKey: `${tag}:self`,
      }),
    ).rejects.toMatchObject({ code: "SELF_PARTICIPATION" });
    await expect(
      submitActivity(participant, {
        campaignId: campaign.id,
        type: "QUALIFIED_VIEW",
        eventId,
        idempotencyKey: `${tag}:not-joined`,
      }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_JOINED" });
    await joinEvent(participant, eventId);
    await joinEvent(participant, eventId);
    expect(await db.eventMembership.count({ where: { userId: participant.id, eventId } })).toBe(1);
    const input = {
      campaignId: campaign.id,
      type: "QUALIFIED_VIEW",
      eventId,
      creatorHandle: creator.handle!,
      idempotencyKey: `${tag}:activity-one`,
      evidence: "Meaningful submitted test evidence for independent review.",
    };
    const result = await submitActivity(participant, input);
    activityId = result.activity.id;
    expect(result.activity.state).toBe("PENDING_VALIDATION");
    expect((await submitActivity(participant, input)).activity.id).toBe(activityId);
    await expect(
      submitActivity(participant, {
        ...input,
        evidence: "Changed evidence must conflict with the same operation key.",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await db.rewardUnit.count({ where: { activityId } })).toBe(0);
    expect(await balance(db, `campaign:${campaign.id}`)).toBe(500n);
  });
  it("concurrent independent validation posts one charge with distinct user, creator and advertiser RU, XP and EP", async () => {
    await Promise.all([
      reviewActivity(admin, activityId, { decision: "VALIDATE", reason: longReason }),
      reviewActivity(admin, activityId, { decision: "VALIDATE", reason: longReason }),
    ]);
    expect(await balance(db, `campaign:${campaign.id}`)).toBe(475n);
    expect(
      await db.ledgerTransaction.count({ where: { idempotencyKey: `activity:${activityId}` } }),
    ).toBe(1);
    const units = await db.rewardUnit.findMany({ where: { activityId } });
    expect(units.map((unit) => unit.category).sort()).toEqual(["ADVERTISER", "CREATOR", "USER"]);
    expect(units.find((unit) => unit.category === "ADVERTISER")?.amountMicros).toBe(500000n);
    expect((await db.xpEntry.findFirst({ where: { activityId } }))?.amount).toBe(40);
    expect((await db.eventPoint.findFirst({ where: { activityId } }))?.amount).toBe(15);
    const event = await getEvent(`test-event-${tag}`, participant);
    expect(event.personal?.points).toBe(15);
    expect(event.personal?.rank).toBe(1);
  });
  it("reverses before distribution with compensating money, RU state, XP and scoped EP", async () => {
    const result = await submitActivity(participant, {
      campaignId: campaign.id,
      type: "QUALIFIED_VIEW",
      eventId,
      creatorHandle: creator.handle!,
      idempotencyKey: `${tag}:activity-two`,
    });
    reversibleActivityId = result.activity.id;
    await reviewActivity(admin, reversibleActivityId, { decision: "VALIDATE", reason: longReason });
    await expect(
      reverseActivity(
        { ...advertiser, roles: ["USER", "ADVERTISER", "ADMIN"] },
        reversibleActivityId,
        { reason: longReason },
      ),
    ).rejects.toMatchObject({ code: "REVIEW_CONFLICT" });
    await reverseActivity(admin, reversibleActivityId, {
      reason: "Independent investigation invalidated the supplied evidence.",
    });
    await reverseActivity(admin, reversibleActivityId, {
      reason: "Independent investigation invalidated the supplied evidence.",
    });
    expect(await balance(db, `campaign:${campaign.id}`)).toBe(475n);
    expect(
      await db.rewardUnit.count({ where: { activityId: reversibleActivityId, state: "REVERSED" } }),
    ).toBe(3);
    expect(
      (
        await db.xpEntry.aggregate({
          where: { activityId: reversibleActivityId },
          _sum: { amount: true },
        })
      )._sum.amount,
    ).toBe(0);
    expect((await getEvent(`test-event-${tag}`, participant)).personal?.points).toBe(15);
  });
  it("rejects review without rewards and holds prevent new economic activity", async () => {
    const pending = await submitActivity(participant, {
      campaignId: campaign.id,
      type: "QUALIFIED_VIEW",
      idempotencyKey: `${tag}:rejected`,
    });
    await reviewActivity(admin, pending.activity.id, {
      decision: "REJECT",
      reason: "The submitted activity did not meet the campaign evidence requirements.",
    });
    expect(await db.rewardUnit.count({ where: { activityId: pending.activity.id } })).toBe(0);
    await setAccountHold(admin, participant.id, {
      economicHold: true,
      reason: "A review is required before additional economic activity.",
    });
    await expect(
      submitActivity(participant, {
        campaignId: campaign.id,
        type: "QUALIFIED_VIEW",
        idempotencyKey: `${tag}:held`,
      }),
    ).rejects.toMatchObject({ code: "ECONOMIC_HOLD" });
    await setAccountHold(admin, participant.id, {
      economicHold: false,
      reason: "Independent review completed and participation can resume.",
    });
  });
  it("concurrent validations cannot overspend remaining escrow or the daily budget", async () => {
    for (const constraint of ["total", "daily"] as const) {
      const limited = (
        await createCampaign(advertiser, {
          name: `Limited ${constraint} ${tag}`,
          objective: "QUALIFIED_VIEW",
          destinationUrl: "https://example.com/story",
          budgetMinor: constraint === "total" ? "50" : "100",
          dailyBudgetMinor: constraint === "total" ? "50" : "25",
          unitCostMinor: "25",
          startAt: new Date(Date.now() - 60000).toISOString(),
          endAt: new Date(Date.now() + 3600000).toISOString(),
          frequencyCap: 3,
        })
      ).campaign;
      await fundCampaign(advertiser, limited.id, {
        amountMinor: constraint === "total" ? "50" : "100",
        idempotencyKey: `${tag}:limited-fund-${constraint}`,
      });
      await submitCampaign(advertiser, limited.id);
      await reviewCampaign(admin, limited.id, { decision: "APPROVE", reason: longReason });
      const pending = [];
      const count = constraint === "total" ? 3 : 2;
      for (let index = 0; index < count; index++)
        pending.push(
          (
            await submitActivity(participant, {
              campaignId: limited.id,
              type: "QUALIFIED_VIEW",
              idempotencyKey: `${tag}:limited-${constraint}-${index}`,
            })
          ).activity,
        );
      const outcomes = await Promise.allSettled(
        pending.map((item) =>
          reviewActivity(admin, item.id, { decision: "VALIDATE", reason: longReason }),
        ),
      );
      expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(count - 1);
      expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(1);
      expect(await balance(db, `campaign:${limited.id}`)).toBe(constraint === "total" ? 0n : 75n);
      expect(
        await db.activity.count({ where: { campaignId: limited.id, state: "VALIDATED" } }),
      ).toBe(count - 1);
    }
  });
  it("database rejects unbalanced postings, historical mutation and late added entries", async () => {
    const existing = await db.ledgerEntry.findFirstOrThrow({
      where: { transaction: { referenceId: activityId } },
    });
    await expect(
      db.ledgerEntry.update({ where: { id: existing.id }, data: { amountMinor: 999n } }),
    ).rejects.toThrow();
    await expect(
      db.ledgerTransaction.create({
        data: {
          idempotencyKey: `${tag}:invalid-ledger`,
          kind: "TEST",
          referenceId: tag,
          description: "Must be rejected at commit",
          entries: { create: [{ accountId: `campaign:${campaign.id}`, amountMinor: -1n }] },
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.ledgerEntry.create({
        data: {
          transactionId: existing.transactionId,
          accountId: "platform:cash-clearing",
          amountMinor: 1n,
        },
      }),
    ).rejects.toThrow();
    await atomic(async (tx) => {
      await account(tx, `test-empty:${tag}`, "USER_PAYABLE", { userId: participant.id });
    });
    await expect(
      db.ledgerTransaction.create({
        data: {
          idempotencyKey: `${tag}:overdraw`,
          kind: "TEST",
          referenceId: tag,
          description: "Must reject negative protected account",
          entries: {
            create: [
              { accountId: `test-empty:${tag}`, amountMinor: -1n },
              { accountId: "platform:cash-clearing", amountMinor: 1n },
            ],
          },
        },
      }),
    ).rejects.toThrow();
  });
  it("invalidates a preview when a participant hold or current policy version changes", async () => {
    const endAt = new Date().toISOString();
    const result = await createDistributionPreview(admin, { startAt: periodStart, endAt });
    await setAccountHold(admin, participant.id, {
      economicHold: true,
      reason: "Temporary verification hold must invalidate the financial snapshot.",
    });
    await expect(
      commitDistribution(admin, {
        previewId: result.distribution.id,
        idempotencyKey: `${tag}:stale-hold`,
      }),
    ).rejects.toMatchObject({ code: "STALE_PREVIEW" });
    await setAccountHold(admin, participant.id, {
      economicHold: false,
      reason: "Independent review completed; eligibility can be reassessed.",
    });
    await updateEconomicRules(admin, {
      version: `integration-new-${tag}`,
      config: JSON.parse(
        JSON.stringify(DEVELOPMENT_RULES, (_, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      ),
      reason: "Operator creates a fresh immutable economic policy version.",
    });
    await expect(
      commitDistribution(admin, {
        previewId: result.distribution.id,
        idempotencyKey: `${tag}:stale-rule`,
      }),
    ).rejects.toMatchObject({ code: "STALE_RULES" });
  });
  it("finalizes a closed frozen period through the global pool and consumes RU exactly once", async () => {
    const result = await createDistributionPreview(admin, {
      startAt: periodStart,
      endAt: new Date().toISOString(),
    });
    expect(result.preview.distributedMinor).toBeGreaterThan(0n);
    const committed = await commitDistribution(admin, {
      previewId: result.distribution.id,
      idempotencyKey: `${tag}:finalize`,
    });
    expect(committed.distribution.state).toBe("FINALIZED");
    const again = await commitDistribution(admin, {
      previewId: result.distribution.id,
      idempotencyKey: `${tag}:finalize`,
    });
    expect(again.distribution.id).toBe(committed.distribution.id);
    expect(await balance(db, "pool:global")).toBe(0n);
    expect(await balance(db, `user:${participant.id}`)).toBeGreaterThan(0n);
    expect(
      await db.rewardUnit.count({
        where: { activityId, state: "CONSUMED", distributionId: result.distribution.id },
      }),
    ).toBe(3);
    await expect(
      db.distribution.update({ where: { id: result.distribution.id }, data: { snapshot: {} } }),
    ).rejects.toThrow();
    await expect(
      reverseActivity(admin, activityId, {
        reason: "Historical corrections require a separately reviewed recovery operation.",
      }),
    ).rejects.toMatchObject({ code: "FINALIZED_HISTORY" });
    await expect(
      createDistributionPreview(admin, { startAt: periodStart, endAt: new Date().toISOString() }),
    ).rejects.toMatchObject({ code: "PERIOD_OVERLAP" });
    const entries = await db.ledgerEntry.groupBy({
      by: ["transactionId"],
      _sum: { amountMinor: true },
    });
    expect(entries.every((entry) => entry._sum.amountMinor === 0n)).toBe(true);
  });
  it("production rejects demo credentials and already-issued demo sessions", async () => {
    const result = await register({
      email: `demo-${tag}@integration.test`,
      password,
      displayName: "Demo credentials",
    });
    await db.user.update({ where: { id: result.user.id }, data: { isDemo: true } });
    expect((await userFromToken(result.session.token))?.id).toBe(result.user.id);
    vi.stubEnv("NODE_ENV", "production");
    await expect(login({ email: result.user.email, password })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(await userFromToken(result.session.token)).toBeNull();
    vi.unstubAllEnvs();
  });
  it("production rejects demo funding and contaminated revenue distributions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      fundCampaign(advertiser, campaign.id, {
        amountMinor: "1",
        idempotencyKey: `${tag}:production`,
      }),
    ).rejects.toMatchObject({ code: "PAYMENTS_UNAVAILABLE" });
    await expect(
      createDistributionPreview(admin, {
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    ).rejects.toThrow();
    // Choose a non-overlapping historical window; all demo ledger provenance is checked, not only the selected period.
    await expect(
      createDistributionPreview(admin, {
        startAt: "2000-01-01T00:00:00.000Z",
        endAt: "2000-01-02T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "DEMO_PRODUCTION_BLOCKED" });
    vi.unstubAllEnvs();
  });
});
