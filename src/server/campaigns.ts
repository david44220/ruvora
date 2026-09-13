import { z } from "zod";
import type { User } from "@prisma/client";
import { atomic, db, jsonValue } from "./db";
import { assert } from "./errors";
import { requireRole } from "./auth";
import { account, balance, postLedger } from "./ledger";
import { activeRules, minor } from "./rules";
import { assertEligible, safeUrl } from "./profiles";
const positiveMinor = minor.refine((v) => v > 0n, "Amount must be positive.");
export const idempotencyKey = z.string().regex(/^[a-zA-Z0-9:_-]{8,100}$/);
export const reason = z.string().trim().min(10).max(500);
const campaignSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().max(1000).default(""),
    objective: z.enum([
      "IMPRESSION",
      "QUALIFIED_VIEW",
      "CLICK",
      "CONVERSION",
      "CREATOR_PROMOTION",
      "SPONSORED_MISSION",
    ]),
    destinationUrl: safeUrl,
    budgetMinor: positiveMinor,
    dailyBudgetMinor: positiveMinor,
    unitCostMinor: positiveMinor,
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    eventId: z.string().max(100).optional(),
    frequencyCap: z.number().int().min(1).max(10).default(3),
  })
  .strict();
export async function createCampaign(user: User, input: unknown) {
  requireRole(user, "ADVERTISER");
  const value = campaignSchema.parse(input);
  assert(
    value.unitCostMinor <= value.dailyBudgetMinor && value.dailyBudgetMinor <= value.budgetMinor,
    "INVALID_BUDGET",
    "Unit cost must fit the daily and total campaign budgets.",
  );
  const startAt = new Date(value.startAt),
    endAt = new Date(value.endAt);
  assert(
    startAt < endAt && endAt > new Date(),
    "INVALID_WINDOW",
    "Campaign end must follow its start and be in the future.",
  );
  return atomic(async (tx) => {
    await assertEligible(tx, user.id);
    const { config } = await activeRules(tx);
    assert(
      config.reward.rates[value.objective],
      "UNSUPPORTED_OBJECTIVE",
      "This campaign objective has not been configured.",
    );
    if (value.eventId) {
      const event = await tx.event.findUnique({ where: { id: value.eventId } });
      assert(
        event && event.state === "ACTIVE" && startAt >= event.startAt && endAt <= event.endAt,
        "EVENT_WINDOW",
        "Linked campaigns must fall within an active event window.",
      );
    }
    const campaign = await tx.campaign.create({
      data: { ...value, startAt, endAt, advertiserId: user.id },
    });
    await account(tx, `campaign:${campaign.id}`, "CAMPAIGN_ESCROW", { campaignId: campaign.id });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "CAMPAIGN_CREATED", targetId: campaign.id, details: {} },
    });
    return { campaign };
  });
}
export async function fundCampaign(user: User, campaignId: string, input: unknown) {
  requireRole(user, "ADVERTISER");
  assert(
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_FUNDING === "true",
    "PAYMENTS_UNAVAILABLE",
    "Live payments are not connected. Development funding is disabled.",
    503,
  );
  const value = z.object({ amountMinor: positiveMinor, idempotencyKey }).strict().parse(input);
  return atomic(async (tx) => {
    await assertEligible(tx, user.id);
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      campaign && campaign.advertiserId === user.id,
      "CAMPAIGN_NOT_FOUND",
      "Campaign not found.",
      404,
    );
    assert(
      ["DRAFT", "PENDING_REVIEW", "PAUSED", "ACTIVE"].includes(campaign.state),
      "INVALID_CAMPAIGN_STATE",
      "This campaign cannot be funded.",
      409,
    );
    const key = `demo-fund:${user.id}:${value.idempotencyKey}`;
    const existing = await tx.ledgerTransaction.findUnique({
      where: { idempotencyKey: key },
      include: { entries: true },
    });
    if (existing) {
      assert(
        existing.referenceId === campaignId &&
          existing.entries.some(
            (entry) =>
              entry.accountId === `campaign:${campaignId}` &&
              entry.amountMinor === value.amountMinor,
          ),
        "IDEMPOTENCY_CONFLICT",
        "This key was used for different funding.",
        409,
      );
      return { transaction: existing, isDemo: true };
    }
    const funding =
      (
        await tx.ledgerEntry.aggregate({
          where: { accountId: `campaign:${campaignId}`, transaction: { kind: "DEMO_DEPOSIT" } },
          _sum: { amountMinor: true },
        })
      )._sum.amountMinor ?? 0n;
    assert(
      funding + value.amountMinor <= campaign.budgetMinor,
      "BUDGET_EXCEEDED",
      "Funding exceeds the total campaign budget.",
      409,
    );
    await account(tx, "platform:cash-clearing", "CASH_CLEARING");
    await account(tx, `campaign:${campaignId}`, "CAMPAIGN_ESCROW", { campaignId });
    const transaction = await postLedger(tx, {
      key,
      kind: "DEMO_DEPOSIT",
      referenceId: campaignId,
      description: "Development funding; no real payment collected",
      isDemo: true,
      entries: [
        { accountId: "platform:cash-clearing", amountMinor: -value.amountMinor },
        { accountId: `campaign:${campaignId}`, amountMinor: value.amountMinor },
      ],
    });
    await tx.campaign.update({ where: { id: campaignId }, data: { isDemo: true } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "DEMO_CAMPAIGN_FUNDED",
        targetId: campaignId,
        details: jsonValue({ amountMinor: value.amountMinor, transactionId: transaction.id }),
      },
    });
    return { transaction, isDemo: true };
  });
}
export async function submitCampaign(user: User, campaignId: string) {
  requireRole(user, "ADVERTISER");
  return atomic(async (tx) => {
    await assertEligible(tx, user.id);
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      campaign && campaign.advertiserId === user.id,
      "CAMPAIGN_NOT_FOUND",
      "Campaign not found.",
      404,
    );
    assert(
      ["DRAFT", "REJECTED"].includes(campaign.state),
      "INVALID_CAMPAIGN_STATE",
      "This campaign is already submitted.",
      409,
    );
    assert(
      (await balance(tx, `campaign:${campaignId}`)) >= campaign.unitCostMinor,
      "INSUFFICIENT_FUNDS",
      "Fund the campaign before submitting.",
      409,
    );
    const { config } = await activeRules(tx);
    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        state: config.campaignReviewRequired ? "PENDING_REVIEW" : "ACTIVE",
        reviewReason: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CAMPAIGN_SUBMITTED",
        targetId: campaignId,
        details: { state: updated.state },
      },
    });
    return { campaign: updated };
  });
}
export async function reviewCampaign(admin: User, campaignId: string, input: unknown) {
  requireRole(admin, "ADMIN");
  const value = z
    .object({ decision: z.enum(["APPROVE", "REJECT"]), reason })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      campaign && campaign.state === "PENDING_REVIEW",
      "INVALID_CAMPAIGN_STATE",
      "Only pending campaigns can be reviewed.",
      409,
    );
    assert(
      campaign.advertiserId !== admin.id,
      "REVIEW_CONFLICT",
      "An administrator cannot review their own campaign.",
      403,
    );
    if (value.decision === "APPROVE") {
      await assertEligible(tx, campaign.advertiserId);
      assert(
        (await balance(tx, `campaign:${campaignId}`)) >= campaign.unitCostMinor &&
          campaign.endAt > new Date(),
        "CAMPAIGN_INELIGIBLE",
        "The campaign must be funded and not expired.",
      );
    }
    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        state: value.decision === "APPROVE" ? "ACTIVE" : "REJECTED",
        reviewReason: value.reason,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "CAMPAIGN_REVIEWED",
        targetId: campaignId,
        details: value,
      },
    });
    return { campaign: updated };
  });
}
export async function listCampaigns(user?: User | null) {
  const campaigns = await db.campaign.findMany({
    where: user?.roles.includes("ADVERTISER")
      ? { OR: [{ advertiserId: user.id }, { state: "ACTIVE" }] }
      : { state: "ACTIVE" },
    include: { event: { select: { id: true, title: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return {
    campaigns: await Promise.all(
      campaigns.map(async (campaign) => {
        const remainingMinor = await balance(db, `campaign:${campaign.id}`);
        const now = new Date();
        const canParticipate =
          campaign.state === "ACTIVE" &&
          campaign.startAt <= now &&
          campaign.endAt > now &&
          remainingMinor >= campaign.unitCostMinor &&
          campaign.advertiserId !== user?.id;
        if (campaign.advertiserId === user?.id || user?.roles.includes("ADMIN"))
          return {
            ...campaign,
            remainingMinor,
            canParticipate,
            validatedCount: await db.activity.count({
              where: { campaignId: campaign.id, state: "VALIDATED" },
            }),
          };
        return {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          objective: campaign.objective,
          destinationUrl: campaign.destinationUrl,
          state: campaign.state,
          startAt: campaign.startAt,
          endAt: campaign.endAt,
          eventId: campaign.eventId,
          event: campaign.event,
          isDemo: campaign.isDemo,
          canParticipate,
        };
      }),
    ),
  };
}
