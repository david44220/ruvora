import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { evaluatePersistedPolicy } from "../domains/policy";
import type { User, EconomicRule } from "@prisma/client";
import {
  previewDistribution,
  finalizeDistribution,
  type DistributionParticipant,
} from "../domains/economy/distribution";
import { atomic, jsonValue, type Tx } from "./db";
import { assert } from "./errors";
import { requireRole } from "./auth";
import { account, balance, postLedger } from "./ledger";
import { activeRules, rulesSchema } from "./rules";
import { idempotencyKey } from "./campaigns";
const fingerprint = (payload: string) => createHash("sha256").update(payload).digest("hex");
async function calculatePreview(
  tx: Tx,
  periodId: string,
  startAt: Date,
  endAt: Date,
  record: EconomicRule,
) {
  const config = rulesSchema.parse(record.config);
  if (process.env.NODE_ENV === "production")
    assert(
      (await tx.ledgerEntry.count({
        where: { accountId: "platform:revenue", transaction: { isDemo: true } },
      })) === 0,
      "DEMO_PRODUCTION_BLOCKED",
      "Development revenue cannot enter a production distribution. Use a clean production database.",
      409,
    );
  const units = await tx.rewardUnit.findMany({
    where: { state: "VALIDATED", createdAt: { gte: startAt, lt: endAt } },
    include: { user: true },
    orderBy: { id: "asc" },
  });
  const grouped = new Map<string, DistributionParticipant>();
  for (const unit of units) {
    const key = `${unit.category}:${unit.userId}`;
    const previous = grouped.get(key);
    const eligible =
      evaluatePersistedPolicy(unit.user, "DISTRIBUTION", config).eligible &&
      (process.env.NODE_ENV !== "production" || !unit.user.isDemo);
    grouped.set(key, {
      userId: unit.userId,
      category: unit.category,
      amountMicros: (previous?.amountMicros ?? 0n) + unit.amountMicros,
      eligible,
      eligibilityReasons: eligible ? [] : ["POLICY_OR_ECONOMIC_HOLD"],
      unitIds: [...(previous?.unitIds ?? []), unit.id],
    });
  }
  const revenue =
    (
      await tx.ledgerEntry.aggregate({
        where: {
          accountId: "platform:revenue",
          createdAt: { gte: startAt, lt: endAt },
          transaction: { kind: { in: ["VALIDATED_ACTIVITY", "ACTIVITY_REVERSAL"] } },
        },
        _sum: { amountMinor: true },
      })
    )._sum.amountMinor ?? 0n;
  const available = await balance(tx, "platform:revenue");
  const eligibleRevenueMinor = revenue < available ? revenue : available;
  assert(
    eligibleRevenueMinor >= 0n,
    "NEGATIVE_REVENUE",
    "Revenue corrections require review before distribution.",
    409,
  );
  return previewDistribution({
    periodId,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    eligibleRevenueMinor,
    rule: config.distribution,
    participants: [...grouped.values()],
    margin: { liabilities: config.liabilities, rule: config.margin },
  });
}
export async function createDistributionPreview(admin: User, input: unknown) {
  requireRole(admin, "ADMIN");
  const value = z
    .object({ startAt: z.iso.datetime(), endAt: z.iso.datetime() })
    .strict()
    .parse(input);
  const startAt = new Date(value.startAt),
    endAt = new Date(value.endAt);
  assert(
    startAt < endAt && endAt <= new Date(),
    "INVALID_PERIOD",
    "A distribution preview requires a closed period.",
  );
  return atomic(async (tx) => {
    const overlap = await tx.distribution.findFirst({
      where: { state: "FINALIZED", startAt: { lt: endAt }, endAt: { gt: startAt } },
    });
    assert(!overlap, "PERIOD_OVERLAP", "This period overlaps a finalized distribution.", 409);
    const { record } = await activeRules(tx);
    const id = randomUUID();
    const preview = await calculatePreview(tx, id, startAt, endAt, record);
    const distribution = await tx.distribution.create({
      data: {
        id,
        startAt,
        endAt,
        ruleId: record.id,
        snapshot: jsonValue(preview),
        fingerprint: fingerprint(preview.payload),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "DISTRIBUTION_PREVIEWED",
        targetId: id,
        details: jsonValue({
          fingerprint: distribution.fingerprint,
          margin: preview.marginDecision,
        }),
      },
    });
    return { distribution, preview };
  });
}
export async function commitDistribution(admin: User, input: unknown) {
  requireRole(admin, "ADMIN");
  const value = z
    .object({ previewId: z.string().min(1).max(100), idempotencyKey })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const distribution = await tx.distribution.findUnique({
      where: { id: value.previewId },
      include: { rule: true },
    });
    assert(distribution, "PREVIEW_NOT_FOUND", "Distribution preview not found.", 404);
    if (distribution.state === "FINALIZED") {
      assert(
        distribution.idempotencyKey === value.idempotencyKey,
        "ALREADY_FINALIZED",
        "This distribution was already finalized.",
        409,
      );
      return { distribution };
    }
    const currentRules = await activeRules(tx);
    assert(
      currentRules.record.id === distribution.ruleId,
      "STALE_RULES",
      "Economic policy changed after this preview. Create a fresh preview.",
      409,
    );
    const overlap = await tx.distribution.findFirst({
      where: {
        state: "FINALIZED",
        startAt: { lt: distribution.endAt },
        endAt: { gt: distribution.startAt },
      },
    });
    assert(!overlap, "PERIOD_OVERLAP", "This period overlaps a finalized distribution.", 409);
    const preview = await calculatePreview(
      tx,
      distribution.id,
      distribution.startAt,
      distribution.endAt,
      distribution.rule,
    );
    assert(
      fingerprint(preview.payload) === distribution.fingerprint,
      "STALE_PREVIEW",
      "Revenue, eligibility or Reward Units changed. Create a fresh preview.",
      409,
    );
    const result = finalizeDistribution(preview, {
      id: distribution.id,
      finalizedAt: new Date().toISOString(),
      idempotencyKey: value.idempotencyKey,
      fundingAccountKey: "pool:global",
      availableFundingMinor: await balance(tx, "platform:revenue"),
    });
    if (result.transaction) {
      await account(tx, "pool:global", "GLOBAL_DISTRIBUTION_POOL");
      await postLedger(tx, {
        key: `pool-funding:${distribution.id}`,
        kind: "GLOBAL_POOL_ALLOCATION",
        referenceId: distribution.id,
        description: "Fund the Global Distribution Pool for finalized participant allocations",
        isDemo: process.env.NODE_ENV !== "production",
        entries: [
          { accountId: "platform:revenue", amountMinor: -preview.distributedMinor },
          { accountId: "pool:global", amountMinor: preview.distributedMinor },
        ],
      });
      for (const allocation of preview.allocations)
        if (allocation.amountMinor > 0n)
          await account(tx, `user:${allocation.userId}`, "USER_PAYABLE", {
            userId: allocation.userId,
          });
      await postLedger(tx, {
        key: `distribution:${value.idempotencyKey}`,
        kind: "REVENUE_DISTRIBUTION",
        referenceId: distribution.id,
        description: `Revenue share ${distribution.startAt.toISOString()} / ${distribution.endAt.toISOString()}`,
        isDemo: process.env.NODE_ENV !== "production",
        entries: result.transaction.entries.map((entry) => ({
          accountId: entry.accountKey,
          amountMinor: entry.amountMinor,
        })),
      });
    }
    const consumed = await tx.rewardUnit.updateMany({
      where: { id: { in: [...result.consumedUnitIds] }, state: "VALIDATED" },
      data: { state: "CONSUMED", distributionId: distribution.id },
    });
    assert(
      consumed.count === result.consumedUnitIds.length,
      "RU_CHANGED",
      "The Reward Unit snapshot has changed.",
      409,
    );
    const finalized = await tx.distribution.update({
      where: { id: distribution.id },
      data: {
        state: "FINALIZED",
        finalizedAt: new Date(result.finalizedAt),
        idempotencyKey: value.idempotencyKey,
        snapshot: jsonValue(result),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "DISTRIBUTION_FINALIZED",
        targetId: distribution.id,
        details: jsonValue({
          idempotencyKey: value.idempotencyKey,
          distributedMinor: preview.distributedMinor,
          consumedUnitCount: consumed.count,
          fingerprint: distribution.fingerprint,
        }),
      },
    });
    return { distribution: finalized };
  });
}
