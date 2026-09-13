import { z } from "zod";
import { evaluatePersistedPolicy } from "../domains/policy";
import type { User } from "@prisma/client";
import { atomic, db, jsonValue } from "./db";
import { requireRole, publicUser } from "./auth";
import { balance } from "./ledger";
import { activeRules, createRules } from "./rules";
import { reason } from "./campaigns";
import { assert } from "./errors";
export async function getDashboard(user: User) {
  const [
    ru,
    xp,
    activityCounts,
    activities,
    campaigns,
    events,
    transactions,
    config,
    referralCount,
  ] = await Promise.all([
    db.rewardUnit.groupBy({
      by: ["state", "category"],
      where: { userId: user.id },
      _sum: { amountMicros: true },
    }),
    db.xpEntry.aggregate({ where: { userId: user.id }, _sum: { amount: true } }),
    db.activity.groupBy({ by: ["state"], where: { userId: user.id }, _count: true }),
    db.activity.findMany({
      where: { userId: user.id },
      include: { campaign: { select: { name: true, isDemo: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.campaign.findMany({
      where: { advertiserId: user.id },
      include: { _count: { select: { activities: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.eventMembership.findMany({ where: { userId: user.id }, include: { event: true }, take: 12 }),
    db.ledgerEntry.findMany({
      where: { accountId: `user:${user.id}` },
      include: { transaction: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    activeRules(db).catch(() => null),
    db.referral.count({ where: { inviterId: user.id } }),
  ]);
  const threshold = config?.config.creatorFollowerThreshold ?? 10;
  const xpTotal = xp._sum.amount ?? 0;
  const enrichedCampaigns = await Promise.all(
    campaigns.map(async (campaign) => ({
      ...campaign,
      remainingMinor: await balance(db, `campaign:${campaign.id}`),
      validatedCount: await db.activity.count({
        where: { campaignId: campaign.id, state: "VALIDATED" },
      }),
    })),
  );
  return {
    user: publicUser(user),
    isDemo:
      user.isDemo ||
      transactions.some((item) => item.transaction.isDemo) ||
      activities.some((item) => item.campaign.isDemo) ||
      (await db.rewardUnit.count({
        where: { userId: user.id, activity: { campaign: { isDemo: true } } },
      })) > 0,
    summary: {
      moneyMinor: await balance(db, `user:${user.id}`),
      currency: "EUR",
      ruMicros: ru
        .filter((item) => item.state === "VALIDATED")
        .reduce((sum, item) => sum + (item._sum.amountMicros ?? 0n), 0n),
      xp: xpTotal,
      level: Math.floor(Math.sqrt(Math.max(0, xpTotal) / 100)) + 1,
      eventPoints:
        (await db.eventPoint.aggregate({ where: { userId: user.id }, _sum: { amount: true } }))._sum
          .amount ?? 0,
      validatedActivities: activityCounts.find((item) => item.state === "VALIDATED")?._count ?? 0,
      pendingActivities:
        activityCounts.find((item) => item.state === "PENDING_VALIDATION")?._count ?? 0,
      referrals: referralCount,
    },
    rewardUnits: ru,
    activities,
    campaigns: enrichedCampaigns,
    events: events.map((item) => item.event),
    transactions,
    eligibility: {
      followerThreshold: threshold,
      audienceStatus: user.audienceStatus,
      creatorEligible: Boolean(
        config && evaluatePersistedPolicy(user, "CREATOR_MONETIZATION", config.config).eligible,
      ),
      earningsGuaranteed: false,
    },
    fundingEnabled:
      process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_FUNDING === "true",
  };
}
export async function getAdmin(user: User) {
  requireRole(user, "ADMIN");
  const [campaigns, activities, users, distributions, auditLogs, rewardUnits, transactions, rules] =
    await Promise.all([
      db.campaign.findMany({
        where: { state: "PENDING_REVIEW" },
        include: { advertiser: { select: { displayName: true, email: true } } },
        take: 50,
        orderBy: { createdAt: "asc" },
      }),
      db.activity.findMany({
        where: { state: "PENDING_VALIDATION" },
        include: {
          user: { select: { displayName: true, handle: true } },
          campaign: { select: { name: true, advertiserId: true, isDemo: true } },
        },
        take: 100,
        orderBy: { createdAt: "asc" },
      }),
      db.user.findMany({
        select: {
          id: true,
          displayName: true,
          handle: true,
          roles: true,
          economicHold: true,
          suspended: true,
          isDemo: true,
        },
        take: 100,
        orderBy: { createdAt: "desc" },
      }),
      db.distribution.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      db.rewardUnit.groupBy({
        by: ["state", "category"],
        _sum: { amountMicros: true },
        _count: true,
      }),
      db.ledgerTransaction.findMany({
        include: { entries: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      activeRules(db).catch(() => null),
    ]);
  return {
    campaigns,
    activities,
    users,
    distributions,
    auditLogs,
    rewardUnits,
    transactions,
    rules: rules
      ? { id: rules.record.id, version: rules.record.version, config: rules.config }
      : null,
    profitability: {
      retainedRevenueMinor: await balance(db, "platform:revenue"),
      userLiabilitiesMinor:
        (
          await db.ledgerEntry.aggregate({
            where: { account: { kind: "USER_PAYABLE" } },
            _sum: { amountMinor: true },
          })
        )._sum.amountMinor ?? 0n,
      campaignLiabilitiesMinor:
        (
          await db.ledgerEntry.aggregate({
            where: { account: { kind: "CAMPAIGN_ESCROW" } },
            _sum: { amountMinor: true },
          })
        )._sum.amountMinor ?? 0n,
      currency: "EUR",
      targetOperatingProfitMinor: rules?.config.margin.targetOperatingProfitMinor ?? 0n,
      costsAreEstimates: true,
      isDemo: transactions.some((item) => item.isDemo),
    },
  };
}
export async function setAccountHold(admin: User, userId: string, input: unknown) {
  requireRole(admin, "ADMIN");
  const value = z
    .object({ economicHold: z.boolean(), suspended: z.boolean().optional(), reason })
    .strict()
    .parse(input);
  assert(userId !== admin.id, "SELF_HOLD", "Use another administrator to review your account.");
  return atomic(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        economicHold: value.economicHold,
        ...(value.suspended !== undefined ? { suspended: value.suspended } : {}),
      },
    });
    if (value.suspended) await tx.session.deleteMany({ where: { userId } });
    await tx.riskEvent.create({
      data: {
        userId,
        kind: value.economicHold ? "HOLD_SET" : "HOLD_RELEASED",
        detail: value.reason,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "ACCOUNT_RISK_UPDATED",
        targetId: userId,
        details: jsonValue(value),
      },
    });
    return { user: publicUser(updated) };
  });
}
export async function updateEconomicRules(admin: User, input: unknown) {
  requireRole(admin, "ADMIN");
  return atomic((tx) => createRules(tx, admin.id, input));
}
