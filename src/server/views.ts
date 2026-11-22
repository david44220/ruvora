import { z } from "zod";
import { evaluatePersistedPolicy } from "../domains/policy";
import type { User } from "@prisma/client";
import { atomic, db, jsonValue } from "./db";
import { requireRole, publicUser } from "./auth";
import { balance } from "./ledger";
import { activeRules, createRules, rulesSchema } from "./rules";
import { reason } from "./campaigns";
import { publicEvent } from "./events";
import { isDevelopment } from "./environment";
import { assert } from "./errors";
import { consumeApproval } from "./security/approvals";
import { getCreatorReliability } from "./risk";
export async function getDashboard(user: User) {
  const [
    ru,
    xp,
    questXp,
    activityCounts,
    activities,
    campaigns,
    events,
    transactions,
    config,
    referralCount,
    reliability,
    unreadNotifications,
    latestDistribution,
  ] = await Promise.all([
    db.rewardUnit.groupBy({
      by: ["state", "category"],
      where: { userId: user.id },
      _sum: { amountMicros: true },
    }),
    db.xpEntry.aggregate({ where: { userId: user.id }, _sum: { amount: true } }),
    db.questClaim.aggregate({ where: { userId: user.id }, _sum: { xpAwarded: true } }),
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
    getCreatorReliability(db, user),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.distribution.findFirst({
      where: { state: "FINALIZED" },
      orderBy: { finalizedAt: "desc" },
      select: { finalizedAt: true, startAt: true, endAt: true },
    }),
  ]);
  const threshold = config?.config.creatorFollowerThreshold ?? 10;
  const xpTotal = (xp._sum.amount ?? 0) + (questXp._sum.xpAwarded ?? 0);
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [campaignBalances, campaignValidated] = campaignIds.length
    ? await Promise.all([
        db.ledgerEntry.groupBy({
          by: ["accountId"],
          where: { accountId: { in: campaignIds.map((id) => `campaign:${id}`) } },
          _sum: { amountMinor: true },
        }),
        db.activity.groupBy({
          by: ["campaignId"],
          where: { campaignId: { in: campaignIds }, state: "VALIDATED" },
          _count: true,
        }),
      ])
    : [[], []];
  const balanceMap = new Map(
    campaignBalances.map((row) => [row.accountId, row._sum.amountMinor ?? 0n]),
  );
  const validatedMap = new Map(campaignValidated.map((row) => [row.campaignId, row._count]));
  const enrichedCampaigns = campaigns.map((campaign) => ({
    ...campaign,
    remainingMinor: balanceMap.get(`campaign:${campaign.id}`) ?? 0n,
    validatedCount: validatedMap.get(campaign.id) ?? 0,
  }));
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
    reliability,
    unreadNotifications,
    walletMeta: {
      microPayoutThresholdMinor: "500",
      payoutsConnected: false,
      lastDistributionAt: latestDistribution?.finalizedAt ?? null,
    },
    rewardUnits: ru,
    activities,
    campaigns: enrichedCampaigns,
    events: events.map((item) => publicEvent(item.event)),
    transactions,
    eligibility: {
      followerThreshold: threshold,
      audienceStatus: user.audienceStatus,
      creatorEligible: Boolean(
        config && evaluatePersistedPolicy(user, "CREATOR_MONETIZATION", config.config).eligible,
      ),
      earningsGuaranteed: false,
    },
    fundingEnabled: isDevelopment() && process.env.ALLOW_DEMO_FUNDING === "true",
  };
}
export async function getAdmin(user: User) {
  requireRole(user, "ADMIN");
  const [
    campaigns,
    activities,
    validatedActivities,
    users,
    distributions,
    auditLogs,
    rewardUnits,
    transactions,
    rules,
  ] = await Promise.all([
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
        providerConversions: { select: { decision: true, provider: true } },
      },
      take: 100,
      orderBy: { createdAt: "asc" },
    }),
    db.activity.findMany({
      where: {
        state: "VALIDATED",
        rewards: { none: { state: "CONSUMED" } },
      },
      include: {
        user: { select: { displayName: true, handle: true } },
        campaign: { select: { name: true, advertiserId: true, isDemo: true } },
      },
      take: 30,
      orderBy: { validatedAt: "desc" },
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
    validatedActivities,
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
      grossValidatedRevenueMinor:
        (
          await db.ledgerEntry.aggregate({
            where: { accountId: "platform:revenue", transaction: { kind: "VALIDATED_ACTIVITY" } },
            _sum: { amountMinor: true },
          })
        )._sum.amountMinor ?? 0n,
      eventPrizeLiabilitiesMinor:
        (
          await db.ledgerEntry.aggregate({
            where: { account: { kind: "EVENT_PRIZE" } },
            _sum: { amountMinor: true },
          })
        )._sum.amountMinor ?? 0n,
      advertiserAvailableMinor:
        (
          await db.ledgerEntry.aggregate({
            where: { account: { kind: "ADVERTISER_AVAILABLE" } },
            _sum: { amountMinor: true },
          })
        )._sum.amountMinor ?? 0n,
      distributionPoolMinor:
        (
          await db.ledgerEntry.aggregate({
            where: { account: { kind: "GLOBAL_DISTRIBUTION_POOL" } },
            _sum: { amountMinor: true },
          })
        )._sum.amountMinor ?? 0n,
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
    .object({
      economicHold: z.boolean(),
      suspended: z.boolean().optional(),
      reason,
      approvalId: z.string().min(1).max(100).optional(),
    })
    .strict()
    .parse(input);
  assert(userId !== admin.id, "SELF_HOLD", "Use another administrator to review your account.");
  return atomic(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert(
      fresh.roles.includes("ADMIN") && !fresh.suspended && !fresh.economicHold,
      "FORBIDDEN",
      "An active administrator is required.",
      403,
    );
    if (!isDevelopment() || value.approvalId) {
      assert(
        value.approvalId,
        "APPROVAL_REQUIRED",
        "An independent approval is required for account holds outside development.",
        403,
      );
      const currentRules = await activeRules(tx);
      await consumeApproval(tx, admin.id, value.approvalId, {
        operation: "ACCOUNT_HOLD",
        targetId: userId,
        payload: {
          economicHold: value.economicHold,
          ...(value.suspended !== undefined ? { suspended: value.suspended } : {}),
        },
        ruleVersion: currentRules.record.version,
      });
    }
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
  const parsed = z
    .object({
      version: z.string().min(3).max(80),
      config: rulesSchema,
      reason: z.string().trim().min(10).max(500),
      approvalId: z.string().min(1).max(100).optional(),
    })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert(
      fresh.roles.includes("ADMIN") && !fresh.suspended && !fresh.economicHold,
      "FORBIDDEN",
      "An active administrator is required.",
      403,
    );
    if (!isDevelopment() || parsed.approvalId) {
      assert(
        parsed.approvalId,
        "APPROVAL_REQUIRED",
        "An independent approval is required for economic rule updates outside development.",
        403,
      );
      await consumeApproval(tx, admin.id, parsed.approvalId, {
        operation: "RULE_UPDATE",
        targetId: parsed.version,
        payload: jsonValue(parsed.config),
        ruleVersion: parsed.version,
      });
    }
    return createRules(tx, admin.id, {
      version: parsed.version,
      config: jsonValue(parsed.config),
      reason: parsed.reason,
    });
  });
}
