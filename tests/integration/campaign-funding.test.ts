import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, atomic, jsonValue } from "../../src/server/db";
import { account, balance, postLedger } from "../../src/server/ledger";
import { createCampaign, fundCampaign } from "../../src/server/campaigns";
import { DEVELOPMENT_RULES } from "../../src/server/rules";

const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe");
if (!testUrl.pathname.endsWith("_test"))
  throw new Error(
    "Campaign funding tests require an isolated *_test database; no financial history is reset or deleted.",
  );
const tag = randomUUID();
const sources = ["DEVELOPMENT", "AVAILABLE"] as const;
type Source = (typeof sources)[number];
beforeAll(async () => {
  vi.stubEnv("APP_ENV", "development");
  vi.stubEnv("ALLOW_DEMO_FUNDING", "true");
  await atomic(async (tx) => {
    await tx.economicRule.updateMany({ where: { active: true }, data: { active: false } });
    await tx.economicRule.create({
      data: { version: `campaign-funding-${tag}`, config: jsonValue(DEVELOPMENT_RULES) },
    });
  });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});
async function fixture() {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: {
      email: `campaign-funding-${suffix}@integration.test`,
      displayName: "Isolated funding advertiser",
      passwordHash: "service-fixture-not-a-login",
      roles: ["USER", "ADVERTISER"],
      onboarded: true,
      ageEligible: true,
      termsAcceptedAt: new Date(),
      country: "FR",
      isDemo: true,
    },
  });
  await atomic(async (tx) => {
    await account(tx, `clearing:campaign-test:${suffix}`, "CASH_CLEARING");
    await account(tx, `advertiser:${user.id}`, "ADVERTISER_AVAILABLE", { userId: user.id });
    await postLedger(tx, {
      key: `campaign-test-deposit:${suffix}`,
      kind: "DEVELOPMENT_TEST_DEPOSIT",
      referenceId: user.id,
      description: "Isolated campaign funding fixture; no real payment",
      isDemo: true,
      entries: [
        { accountId: `clearing:campaign-test:${suffix}`, amountMinor: -1000n },
        { accountId: `advertiser:${user.id}`, amountMinor: 1000n },
      ],
    });
  });
  const { campaign } = await createCampaign(user, {
    name: `Funding regression ${suffix}`,
    objective: "QUALIFIED_VIEW",
    destinationUrl: "https://example.com/funding",
    budgetMinor: "1000",
    dailyBudgetMinor: "1000",
    unitCostMinor: "25",
    startAt: new Date(Date.now() - 60_000).toISOString(),
    endAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  return { user, campaign, key: `funding:${suffix}` };
}
async function assertNoEconomicRewards(userId: string, campaignId: string) {
  expect(await db.rewardUnit.count({ where: { userId } })).toBe(0);
  expect(await db.xpEntry.count({ where: { userId } })).toBe(0);
  expect(await db.eventPoint.count({ where: { userId } })).toBe(0);
  const journals = await db.ledgerTransaction.findMany({
    where: { referenceId: campaignId },
    include: { entries: true },
  });
  expect(journals.length).toBeGreaterThan(0);
  for (const journal of journals) {
    expect(journal.isDemo).toBe(true);
    expect(journal.entries.reduce((sum, row) => sum + row.amountMinor, 0n)).toBe(0n);
  }
}
describe("Campaign funding command identity", () => {
  it.each(sources)("rejects changing %s to another source with the same key", async (source) => {
    const { user, campaign, key } = await fixture();
    const original = await fundCampaign(user, campaign.id, {
      source,
      amountMinor: "100",
      idempotencyKey: key,
    });
    const before = await balance(db, `advertiser:${user.id}`);
    const other: Source = source === "DEVELOPMENT" ? "AVAILABLE" : "DEVELOPMENT";
    await expect(
      fundCampaign(user, campaign.id, { source: other, amountMinor: "100", idempotencyKey: key }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await balance(db, `campaign:${campaign.id}`)).toBe(100n);
    expect(await balance(db, `advertiser:${user.id}`)).toBe(before);
    expect(
      (await fundCampaign(user, campaign.id, { source, amountMinor: "100", idempotencyKey: key }))
        .transaction.id,
    ).toBe(original.transaction.id);
    expect(
      await db.ledgerTransaction.count({
        where: { referenceId: campaign.id, kind: "CAMPAIGN_FUND" },
      }),
    ).toBe(1);
    await assertNoEconomicRewards(user.id, campaign.id);
  });
  it.each(sources)(
    "concurrent identical %s commands and later replay reserve funds once",
    async (source) => {
      const { user, campaign, key } = await fixture();
      const input = { source, amountMinor: "100", idempotencyKey: key };
      const results = await Promise.all([
        fundCampaign(user, campaign.id, input),
        fundCampaign(user, campaign.id, input),
      ]);
      expect(results[0].transaction.id).toBe(results[1].transaction.id);
      expect((await fundCampaign(user, campaign.id, input)).transaction.id).toBe(
        results[0].transaction.id,
      );
      expect(await balance(db, `campaign:${campaign.id}`)).toBe(100n);
      expect(await balance(db, `advertiser:${user.id}`)).toBe(
        source === "DEVELOPMENT" ? 1000n : 900n,
      );
      expect(
        await db.ledgerTransaction.count({
          where: { referenceId: campaign.id, kind: "CAMPAIGN_FUND" },
        }),
      ).toBe(1);
      expect(
        await db.ledgerTransaction.count({
          where: { referenceId: campaign.id, kind: "DEMO_DEPOSIT" },
        }),
      ).toBe(source === "DEVELOPMENT" ? 1 : 0);
      await assertNoEconomicRewards(user.id, campaign.id);
    },
  );
  it("concurrent mixed-source requests commit exactly one source and reject the other", async () => {
    const { user, campaign, key } = await fixture();
    const outcomes = await Promise.allSettled(
      sources.map((source) =>
        fundCampaign(user, campaign.id, { source, amountMinor: "100", idempotencyKey: key }),
      ),
    );
    expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((row) => row.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected")
      expect(rejected.reason).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const winningSource = sources[outcomes.findIndex((row) => row.status === "fulfilled")];
    expect(await balance(db, `campaign:${campaign.id}`)).toBe(100n);
    expect(await balance(db, `advertiser:${user.id}`)).toBe(
      winningSource === "DEVELOPMENT" ? 1000n : 900n,
    );
    expect(
      await db.ledgerTransaction.count({
        where: { referenceId: campaign.id, kind: "CAMPAIGN_FUND" },
      }),
    ).toBe(1);
    await assertNoEconomicRewards(user.id, campaign.id);
  });
  it("preserves legacy direct-to-campaign demo funding replay without a new transfer", async () => {
    const { user, campaign, key } = await fixture();
    const original = await atomic(async (tx) => {
      await account(tx, "platform:cash-clearing", "CASH_CLEARING");
      return postLedger(tx, {
        key: `demo-fund:${user.id}:${key}`,
        kind: "DEMO_DEPOSIT",
        referenceId: campaign.id,
        description: "Synthetic legacy Pass 01 funding fixture",
        isDemo: true,
        entries: [
          { accountId: "platform:cash-clearing", amountMinor: -100n },
          { accountId: `campaign:${campaign.id}`, amountMinor: 100n },
        ],
      });
    });
    const replay = await fundCampaign(user, campaign.id, {
      source: "DEVELOPMENT",
      amountMinor: "100",
      idempotencyKey: key,
    });
    expect(replay.transaction.id).toBe(original.id);
    await expect(
      fundCampaign(user, campaign.id, {
        source: "AVAILABLE",
        amountMinor: "100",
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await balance(db, `campaign:${campaign.id}`)).toBe(100n);
    expect(await balance(db, `advertiser:${user.id}`)).toBe(1000n);
    expect(await db.ledgerTransaction.count({ where: { referenceId: campaign.id } })).toBe(1);
    await assertNoEconomicRewards(user.id, campaign.id);
  });
});
