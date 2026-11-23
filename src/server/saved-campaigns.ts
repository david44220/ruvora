import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, type Tx } from "./db";
import { assert } from "./errors";
import { isDevelopment } from "./environment";
import { notifyUser } from "./notifications";

const toggleSavedSchema = z
  .object({
    campaignId: z.string().min(5).max(80),
  })
  .strict();

/** Lists the user's saved campaign IDs and live capacity percentages. */
export async function listSavedCampaigns(user: User) {
  const dev = isDevelopment();
  const rows = await db.savedCampaign.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          objective: true,
          state: true,
          budgetMinor: true,
          unitCostMinor: true,
          endAt: true,
          isDemo: true,
          advertiser: { select: { displayName: true } },
        },
      },
    },
  });
  const visible = rows.filter((r) => dev || !r.campaign.isDemo);
  const accountIds = visible.map((r) => `campaign:${r.campaignId}`);
  const sums = accountIds.length
    ? await db.ledgerEntry.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accountIds } },
        _sum: { amountMinor: true },
      })
    : [];
  const bal = new Map(sums.map((s) => [s.accountId, s._sum.amountMinor ?? 0n]));

  return {
    savedIds: visible.map((r) => r.campaignId),
    items: visible.map((r) => {
      const rem = bal.get(`campaign:${r.campaignId}`) ?? 0n;
      const pct =
        r.campaign.budgetMinor > 0n
          ? Math.max(0, Math.min(100, Number((rem * 100n) / r.campaign.budgetMinor)))
          : 0;
      return {
        id: r.id,
        campaignId: r.campaignId,
        name: r.campaign.name,
        advertiserName: r.campaign.advertiser.displayName,
        objective: r.campaign.objective,
        state: r.campaign.state,
        budgetRemainingPct: pct,
        lowCapacity: pct > 0 && pct < 20,
        endAt: r.campaign.endAt.toISOString(),
        savedAt: r.createdAt.toISOString(),
      };
    }),
  };
}

/** Toggles a campaign in/out of the authenticated user's watchlist (0 EUR / 0 RU). */
export async function toggleSavedCampaign(user: User, input: unknown) {
  const { campaignId } = toggleSavedSchema.parse(input);
  return atomic(async (tx) => {
    const campaign = await tx.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, state: true, isDemo: true },
    });
    assert(
      campaign && (isDevelopment() || !campaign.isDemo),
      "CAMPAIGN_NOT_FOUND",
      "Campaign not found.",
      404,
    );
    const existing = await tx.savedCampaign.findUnique({
      where: { userId_campaignId: { userId: user.id, campaignId } },
    });
    if (existing) {
      await tx.savedCampaign.delete({ where: { id: existing.id } });
      return { saved: false, campaignId };
    }
    const count = await tx.savedCampaign.count({ where: { userId: user.id } });
    assert(
      count < 30,
      "SAVED_CAMPAIGN_LIMIT",
      "You can save up to 30 offers in your watchlist.",
      409,
    );
    await tx.savedCampaign.create({
      data: { userId: user.id, campaignId },
    });
    return { saved: true, campaignId };
  });
}

/**
 * Sends a preference-gated SAVED_CAMPAIGN_ALERT when a saved campaign drops below 20%
 * remaining funded capacity or resumes from pause. Never blocks or mutates financial state.
 */
export async function notifySavedCampaignWatchers(
  tx: Tx,
  campaignId: string,
  reason: "LOW_CAPACITY" | "RESUMED",
) {
  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, budgetMinor: true, state: true },
  });
  if (!campaign || campaign.state !== "ACTIVE") return 0;

  if (reason === "LOW_CAPACITY") {
    if (campaign.budgetMinor <= 0n) return 0;
    const sum = await tx.ledgerEntry.aggregate({
      where: { accountId: `campaign:${campaignId}` },
      _sum: { amountMinor: true },
    });
    const remaining = sum._sum.amountMinor ?? 0n;
    const pct = Number((remaining * 100n) / campaign.budgetMinor);
    if (pct >= 20) return 0;
  }

  const watchers = await tx.savedCampaign.findMany({
    where: {
      campaignId,
      ...(reason === "LOW_CAPACITY" ? { lowCapacityNotifiedAt: null } : {}),
    },
    take: 50,
  });
  if (!watchers.length) return 0;

  const now = new Date();
  let sent = 0;
  for (const w of watchers) {
    const notif = await notifyUser(tx, {
      userId: w.userId,
      kind: "SAVED_CAMPAIGN_ALERT",
      titleKey: reason === "LOW_CAPACITY" ? "p9NotifSavedLowCapacity" : "p9NotifSavedResumed",
      bodyParams: { campaignName: campaign.name },
      href: `/offers/${campaign.id}`,
    });
    if (reason === "LOW_CAPACITY") {
      await tx.savedCampaign.update({
        where: { id: w.id },
        data: { lowCapacityNotifiedAt: now },
      });
    }
    if (notif) sent++;
  }
  return sent;
}
