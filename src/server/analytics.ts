import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { requireRole } from "./auth";

function jsonRecord(value: Prisma.JsonValue | undefined): Prisma.JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function creatorAllocation(snapshot: Prisma.JsonValue, userId: string) {
  const root = jsonRecord(snapshot);
  const preview = jsonRecord(root?.preview);
  const allocations = preview?.allocations;
  if (!Array.isArray(allocations)) return 0n;
  return allocations.reduce((sum: bigint, value) => {
    const allocation = jsonRecord(value);
    return allocation?.userId === userId &&
      allocation.category === "CREATOR" &&
      typeof allocation.amountMinor === "string" &&
      /^\d+$/.test(allocation.amountMinor)
      ? sum + BigInt(allocation.amountMinor)
      : sum;
  }, 0n);
}
const unitTotal = (units: { amountMicros: bigint; state: string }[]) =>
  units
    .filter((unit) => ["VALIDATED", "CONSUMED"].includes(unit.state))
    .reduce((sum, unit) => sum + unit.amountMicros, 0n);

export async function getCreatorAnalytics(user: User) {
  requireRole(user, "CREATOR");
  const endAt = new Date(),
    startAt = new Date(endAt.getTime() - 90 * 86400000);
  const [growth, contexts, activities, units, referrals, distributions] = await Promise.all([
    db.growthEvent.findMany({
      where: { creatorId: user.id, occurredAt: { gte: startAt, lt: endAt } },
      orderBy: { occurredAt: "asc" },
    }),
    db.growthEvent.count({
      where: {
        creatorId: user.id,
        type: "ATTRIBUTED_SESSION",
        occurredAt: { gte: startAt, lt: endAt },
      },
    }),
    db.activity.findMany({
      where: {
        creatorId: user.id,
        OR: [
          { createdAt: { gte: startAt, lt: endAt } },
          { validatedAt: { gte: startAt, lt: endAt } },
        ],
      },
      include: {
        campaign: { select: { id: true, name: true, isDemo: true } },
        rewards: { where: { userId: user.id, category: "CREATOR" } },
      },
    }),
    db.rewardUnit.findMany({
      where: { userId: user.id, category: "CREATOR", createdAt: { gte: startAt, lt: endAt } },
      select: { amountMicros: true, state: true },
    }),
    db.referral.count({
      where: {
        inviterId: user.id,
        attributionId: { not: null },
        createdAt: { gte: startAt, lt: endAt },
      },
    }),
    db.distribution.findMany({
      where: {
        state: "FINALIZED",
        rewardUnits: { some: { userId: user.id, category: "CREATOR" } },
        finalizedAt: { gte: startAt, lt: endAt },
      },
      select: { id: true, finalizedAt: true, snapshot: true },
    }),
  ]);
  const count = (type: string) => growth.filter((event) => event.type === type).length;
  const allocations = distributions.map((item) => ({
    distributionId: item.id,
    createdAt: item.finalizedAt!,
    amountMinor: creatorAllocation(item.snapshot, user.id),
  }));
  const campaigns = new Map<
    string,
    {
      id: string;
      name: string;
      starts: number;
      validatedActions: number;
      rejectedActions: number;
      creatorRuMicros: bigint;
    }
  >();
  const startedCampaigns = await db.campaign.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            growth
              .filter((event) => event.type === "CAMPAIGN_START" && event.campaignId)
              .map((event) => event.campaignId!),
          ),
        ],
      },
    },
    select: { id: true, name: true },
  });
  for (const campaign of startedCampaigns)
    campaigns.set(campaign.id, {
      ...campaign,
      starts: growth.filter(
        (event) => event.type === "CAMPAIGN_START" && event.campaignId === campaign.id,
      ).length,
      validatedActions: 0,
      rejectedActions: 0,
      creatorRuMicros: 0n,
    });
  for (const activity of activities) {
    const row = campaigns.get(activity.campaignId) ?? {
      id: activity.campaignId,
      name: activity.campaign.name,
      starts: growth.filter(
        (event) => event.type === "CAMPAIGN_START" && event.campaignId === activity.campaignId,
      ).length,
      validatedActions: 0,
      rejectedActions: 0,
      creatorRuMicros: 0n,
    };
    if (activity.state === "VALIDATED") row.validatedActions++;
    if (["REJECTED", "REVERSED"].includes(activity.state)) row.rejectedActions++;
    row.creatorRuMicros += unitTotal(activity.rewards);
    campaigns.set(row.id, row);
  }
  const daily = new Map<
    string,
    { date: string; visits: number; starts: number; validatedActions: number }
  >();
  for (const event of growth) {
    const date = event.occurredAt.toISOString().slice(0, 10),
      row = daily.get(date) ?? { date, visits: 0, starts: 0, validatedActions: 0 };
    if (event.type === "PROFILE_VIEW") row.visits++;
    if (event.type === "CAMPAIGN_START") row.starts++;
    daily.set(date, row);
  }
  for (const activity of activities.filter((item) => item.state === "VALIDATED")) {
    const date = (activity.validatedAt ?? activity.createdAt).toISOString().slice(0, 10),
      row = daily.get(date) ?? { date, visits: 0, starts: 0, validatedActions: 0 };
    row.validatedActions++;
    daily.set(date, row);
  }
  return {
    isDemo:
      user.isDemo ||
      growth.some((item) => item.isDemo) ||
      activities.some((item) => item.campaign.isDemo),
    window: { startAt, endAt },
    summary: {
      profileViews: count("PROFILE_VIEW"),
      attributedSessions: contexts,
      registrations: count("REGISTRATION"),
      campaignStarts: count("CAMPAIGN_START"),
      validatedActions: activities.filter((item) => item.state === "VALIDATED").length,
      conversions: activities.filter(
        (item) => item.state === "VALIDATED" && item.type === "CONVERSION",
      ).length,
      rejectedActions: activities.filter((item) => ["REJECTED", "REVERSED"].includes(item.state))
        .length,
      pendingActivities: activities.filter((item) => item.state === "PENDING_VALIDATION").length,
      creatorRuMicros: unitTotal(units),
      pendingCreatorRuMicros: units
        .filter((unit) => unit.state === "PENDING")
        .reduce((sum, unit) => sum + unit.amountMicros, 0n),
      eventJoins: count("EVENT_JOIN"),
      referrals,
      moneyAllocatedMinor: allocations.reduce((sum, row) => sum + row.amountMinor, 0n),
    },
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    campaigns: [...campaigns.values()],
    allocations,
  };
}

export async function getAdvertiserAnalytics(user: User) {
  requireRole(user, "ADVERTISER");
  const [campaigns, units] = await Promise.all([
    db.campaign.findMany({
      where: { advertiserId: user.id },
      include: { activities: { include: { creator: { select: { displayName: true } } } } },
    }),
    db.rewardUnit.findMany({
      where: { userId: user.id, category: "ADVERTISER" },
      select: { amountMicros: true, state: true },
    }),
  ]);
  const activities = campaigns.flatMap((campaign) => campaign.activities);
  const valid = activities.filter((item) => item.state === "VALIDATED"),
    reversed = activities.filter((item) => item.state === "REVERSED");
  const netSpendMinor = valid.reduce((sum, item) => sum + item.billableMinor, 0n),
    reversedSpendMinor = reversed.reduce((sum, item) => sum + item.billableMinor, 0n);
  const creators = new Map<
    string,
    { creatorId: string; displayName: string; validatedActions: number; spendMinor: bigint }
  >();
  for (const activity of valid)
    if (activity.creatorId && activity.creator) {
      const row = creators.get(activity.creatorId) ?? {
        creatorId: activity.creatorId,
        displayName: activity.creator.displayName,
        validatedActions: 0,
        spendMinor: 0n,
      };
      row.validatedActions++;
      row.spendMinor += activity.billableMinor;
      creators.set(activity.creatorId, row);
    }
  return {
    isDemo: user.isDemo || campaigns.some((item) => item.isDemo),
    summary: {
      campaigns: campaigns.length,
      validatedActions: valid.length,
      rejectedActions: activities.filter((item) => ["REJECTED", "REVERSED"].includes(item.state))
        .length,
      pendingActivities: activities.filter((item) => item.state === "PENDING_VALIDATION").length,
      conversions: valid.filter((item) => item.type === "CONVERSION").length,
      grossSpendMinor: netSpendMinor + reversedSpendMinor,
      reversedSpendMinor,
      netSpendMinor,
      advertiserRuMicros: unitTotal(units),
    },
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      validatedActions: campaign.activities.filter((item) => item.state === "VALIDATED").length,
      rejectedActions: campaign.activities.filter((item) =>
        ["REJECTED", "REVERSED"].includes(item.state),
      ).length,
      spendMinor: campaign.activities
        .filter((item) => item.state === "VALIDATED")
        .reduce((sum, item) => sum + item.billableMinor, 0n),
      creatorCount: new Set(
        campaign.activities
          .filter((item) => item.state === "VALIDATED" && item.creatorId)
          .map((item) => item.creatorId),
      ).size,
    })),
    creators: [...creators.values()],
  };
}

export async function getGrowthAnalytics(admin: User) {
  requireRole(admin, "ADMIN");
  const [counts, contexts, creatorCounts, shareCounts, joins, publishing, candidates] =
    await Promise.all([
      db.growthEvent.groupBy({ by: ["type"], _count: true }),
      db.growthEvent.count({ where: { type: "ATTRIBUTED_SESSION" } }),
      db.growthEvent.count({ where: { type: "REGISTRATION", creatorId: { not: null } } }),
      db.growthEvent.count({ where: { type: "REGISTRATION", shareLinkId: { not: null } } }),
      db.growthEvent.count({ where: { type: "EVENT_JOIN", attributionId: { not: null } } }),
      db.shareLink.findMany({
        where: { creatorId: { not: null }, contexts: { some: {} } },
        distinct: ["creatorId"],
        select: { creatorId: true },
      }),
      db.user.findMany({
        where: { roles: { has: "CREATOR" }, creatorAttributions: { some: {} } },
        select: { id: true, displayName: true, handle: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
  const count = (type: string) => counts.find((row) => row.type === type)?._count ?? 0;
  const ids = candidates.map((creator) => creator.id);
  const [growthByCreator, actionsByCreator, unitsByCreator] = await Promise.all([
    db.growthEvent.groupBy({
      by: ["creatorId", "type"],
      where: { creatorId: { in: ids }, type: { in: ["PROFILE_VIEW", "REGISTRATION"] } },
      _count: true,
    }),
    db.activity.groupBy({
      by: ["creatorId"],
      where: { creatorId: { in: ids }, state: "VALIDATED" },
      _count: true,
    }),
    db.rewardUnit.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, category: "CREATOR", state: { in: ["VALIDATED", "CONSUMED"] } },
      _sum: { amountMicros: true },
    }),
  ]);
  const topCreators = candidates.map((creator) => ({
    handle: creator.handle,
    displayName: creator.displayName,
    visits:
      growthByCreator.find((row) => row.creatorId === creator.id && row.type === "PROFILE_VIEW")
        ?._count ?? 0,
    registrations:
      growthByCreator.find((row) => row.creatorId === creator.id && row.type === "REGISTRATION")
        ?._count ?? 0,
    validatedActions: actionsByCreator.find((row) => row.creatorId === creator.id)?._count ?? 0,
    creatorRuMicros:
      unitsByCreator.find((row) => row.userId === creator.id)?._sum.amountMicros ?? 0n,
  }));
  return {
    isDemo: (await db.growthEvent.count({ where: { isDemo: true } })) > 0,
    summary: {
      profileViews: count("PROFILE_VIEW"),
      attributedSessions: contexts,
      registrations: count("REGISTRATION"),
      creatorRegistrations: creatorCounts,
      referralRegistrations: await db.referral.count({ where: { attributionId: { not: null } } }),
      eventShares: count("EVENT_SHARE"),
      eventJoins: joins,
      shareRegistrations: shareCounts,
      publishingCreators: publishing.length,
    },
    topCreators: topCreators
      .sort((a, b) => b.validatedActions - a.validatedActions || b.visits - a.visits)
      .slice(0, 20),
  };
}
