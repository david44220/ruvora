import { z } from "zod";
import type { Campaign, User } from "@prisma/client";
import { atomic, db, jsonValue, type Tx } from "./db";
import { assert } from "./errors";
import { requireRole } from "./auth";
import { account, balance, postLedger } from "./ledger";
import { activeRules, minor } from "./rules";
import { assertEligible } from "./profiles";
import { safeUrl } from "./validation";
import { evaluatePersistedPolicy } from "../domains/policy";
import {
  campaignRegionAllowed,
  canCreatorPromote,
  campaignRelevanceScore,
} from "./campaign-eligibility";
import { isDevelopment } from "./environment";
import { notifyUser } from "./notifications";
import { getCreatorReliability } from "./risk";
import { resolveAdvertiserWorkspace } from "./workspaces";
import { resolveSmartDestination } from "../lib/smart-routing";
const positiveMinor = minor.refine((v) => v > 0n, "Amount must be positive.");
export const idempotencyKey = z.string().regex(/^[a-zA-Z0-9:_-]{8,100}$/);
export const reason = z.string().trim().min(10).max(500);
const creativeBriefSchema = z
  .object({
    headline: z.string().trim().max(120).default(""),
    talkingPoints: z.array(z.string().trim().min(1).max(160)).max(6).default([]),
    hashtags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    cta: z.string().trim().max(80).default(""),
    formatHint: z.string().trim().max(80).default(""),
    disclosureNote: z.string().trim().max(160).optional().default(""),
    suggestedHooks: z.array(z.string().trim().min(1).max(160)).max(4).optional().default([]),
    assetUrls: z.array(safeUrl).max(5).default([]),
  })
  .strict();
const abVariantSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]{1,24}$/),
    label: z.string().trim().min(1).max(60),
    destinationUrl: safeUrl,
    weight: z.number().int().min(1).max(100).default(50),
  })
  .strict();
const smartRoutingSchema = z
  .object({
    iosUrl: safeUrl.optional(),
    androidUrl: safeUrl.optional(),
    localeUrls: z
      .object({
        fr: safeUrl.optional(),
        en: safeUrl.optional(),
        es: safeUrl.optional(),
        de: safeUrl.optional(),
        it: safeUrl.optional(),
        pt: safeUrl.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
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
    allowedCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(250)
      .default([]),
    creatorCategories: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    minimumCreatorFollowers: z.number().int().min(0).max(1000000000).default(0),
    maximumCreatorFollowers: z.number().int().min(0).max(1000000000).nullable().optional(),
    allowedCities: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    allowedLanguages: z
      .array(z.enum(["fr", "en", "es", "de", "it", "pt"]))
      .max(10)
      .default([]),
    allowedPlatforms: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
    requireVerifiedAudience: z.boolean().default(false),
    minimumReliabilityScore: z.number().int().min(0).max(100).default(0),
    deliveryMode: z.enum(["OPEN", "UGC_BRIEF"]).default("OPEN"),
    creativeBrief: creativeBriefSchema.nullable().optional(),
    abVariants: z.array(abVariantSchema).max(4).nullable().optional(),
    smartRouting: smartRoutingSchema.nullable().optional(),
    maxActivitiesPerCreator: z.number().int().min(1).max(500).nullable().optional(),
    isTemplate: z.boolean().default(false),
    frequencyCap: z.number().int().min(1).max(10).default(3),
  })
  .strict();

async function notifyMatchingCreatorsForCampaign(tx: Tx, campaign: Campaign) {
  const candidates = await tx.user.findMany({
    where: {
      roles: { has: "CREATOR" },
      autoMonetize: true,
      directoryOptIn: true,
      onboarded: true,
      suspended: false,
      economicHold: false,
      anonymizedAt: null,
      id: { not: campaign.advertiserId },
      ...(isDevelopment() ? {} : { isDemo: false }),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      roles: true,
      followers: true,
      category: true,
      country: true,
      city: true,
      preferredLanguages: true,
      socialLinks: true,
      audienceStatus: true,
      emailVerifiedAt: true,
      suspended: true,
      economicHold: true,
    },
    take: 50,
  });
  let notified = 0;
  for (const creator of candidates) {
    if (!canCreatorPromote(creator, campaign)) continue;
    const score = campaignRelevanceScore(creator, campaign);
    if (score < 60) continue;
    await notifyUser(tx, {
      userId: creator.id,
      kind: "CAMPAIGN_MATCH",
      titleKey: "p7NotifCampaignMatch",
      bodyParams: { campaign: campaign.name, score: String(score) },
      href: `/app/promote?campaign=${campaign.id}`,
    });
    notified += 1;
    if (notified >= 25) break;
  }
  return notified;
}

export async function createCampaign(user: User, input: unknown, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "MANAGE_CAMPAIGNS");
  const ownerId = ctx.ownerId;
  const value = campaignSchema.parse(input);
  assert(
    value.unitCostMinor <= value.dailyBudgetMinor && value.dailyBudgetMinor <= value.budgetMinor,
    "INVALID_BUDGET",
    "Unit cost must fit the daily and total campaign budgets.",
  );
  assert(
    value.maximumCreatorFollowers === null ||
      value.maximumCreatorFollowers === undefined ||
      value.maximumCreatorFollowers >= value.minimumCreatorFollowers,
    "VALIDATION_ERROR",
    "Maximum followers must be greater than or equal to minimum followers.",
  );
  const startAt = new Date(value.startAt),
    endAt = new Date(value.endAt);
  assert(
    startAt < endAt && endAt > new Date(),
    "INVALID_WINDOW",
    "Campaign end must follow its start and be in the future.",
  );
  return atomic(async (tx) => {
    await assertEligible(tx, ownerId);
    const { config } = await activeRules(tx);
    assert(
      config.reward.rates[value.objective],
      "UNSUPPORTED_OBJECTIVE",
      "This campaign objective has not been configured.",
    );
    if (value.eventId) {
      const event = await tx.event.findUnique({ where: { id: value.eventId } });
      assert(
        event &&
          !["CANCELLED", "REJECTED", "COMPLETED", "SETTLING", "SETTLED"].includes(event.state) &&
          (!event.ownerId
            ? event.state === "ACTIVE"
            : event.ownerId === ownerId || event.sponsorId === ownerId) &&
          startAt >= event.startAt &&
          endAt <= event.endAt,
        "EVENT_WINDOW",
        "Linked campaigns must belong to an authorized event and fit its participation window.",
      );
    }
    const {
      creativeBrief,
      abVariants,
      smartRouting,
      maximumCreatorFollowers,
      maxActivitiesPerCreator,
      ...rest
    } = value;
    const hasSmartRouting =
      smartRouting &&
      (smartRouting.iosUrl ||
        smartRouting.androidUrl ||
        (smartRouting.localeUrls && Object.values(smartRouting.localeUrls).some(Boolean)));
    const campaign = await tx.campaign.create({
      data: {
        ...rest,
        maximumCreatorFollowers: maximumCreatorFollowers ?? null,
        maxActivitiesPerCreator: maxActivitiesPerCreator ?? null,
        ...(creativeBrief ? { creativeBrief: jsonValue(creativeBrief) } : {}),
        ...(abVariants && abVariants.length > 0 ? { abVariants: jsonValue(abVariants) } : {}),
        ...(hasSmartRouting ? { smartRouting: jsonValue(smartRouting) } : {}),
        startAt,
        endAt,
        advertiserId: ownerId,
      },
    });
    await account(tx, `campaign:${campaign.id}`, "CAMPAIGN_ESCROW", { campaignId: campaign.id });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CAMPAIGN_CREATED",
        targetId: campaign.id,
        details: { workspaceOwnerId: ownerId, delegated: ctx.isDelegated },
      },
    });
    return { campaign };
  });
}
export async function fundCampaign(
  user: User,
  campaignId: string,
  input: unknown,
  workspaceId?: string,
) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "BILLING");
  const ownerId = ctx.ownerId;
  const value = z
    .object({
      amountMinor: positiveMinor,
      idempotencyKey,
      source: z.enum(["DEVELOPMENT", "AVAILABLE"]).default("DEVELOPMENT"),
    })
    .strict()
    .parse(input);
  const development = value.source === "DEVELOPMENT";
  if (development)
    assert(
      isDevelopment() && process.env.ALLOW_DEMO_FUNDING === "true",
      "PAYMENTS_UNAVAILABLE",
      "Development funding is disabled. Reserve confirmed available funds instead.",
      503,
    );
  return atomic(async (tx) => {
    await assertEligible(tx, ownerId);
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      campaign && campaign.advertiserId === ownerId,
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
    const key =
      (development ? "demo-fund:" : "campaign-reserve:") + ownerId + ":" + value.idempotencyKey;
    const matches = await tx.ledgerTransaction.findMany({
      where: {
        idempotencyKey: {
          in: [
            "demo-fund:" + ownerId + ":" + value.idempotencyKey,
            "campaign-reserve:" + ownerId + ":" + value.idempotencyKey,
          ],
        },
      },
      include: { entries: true },
    });
    assert(
      matches.length <= 1,
      "IDEMPOTENCY_CONFLICT",
      "This request identity has conflicting historical funding records.",
      409,
    );
    const existing = matches[0];
    if (existing) {
      assert(
        existing.idempotencyKey === key &&
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
      return { transaction: existing, isDemo: existing.isDemo };
    }
    const funded =
      (
        await tx.ledgerEntry.aggregate({
          where: {
            accountId: `campaign:${campaignId}`,
            transaction: { kind: { in: ["DEMO_DEPOSIT", "CAMPAIGN_FUND"] } },
            amountMinor: { gt: 0n },
          },
          _sum: { amountMinor: true },
        })
      )._sum.amountMinor ?? 0n;
    assert(
      funded + value.amountMinor <= campaign.budgetMinor,
      "BUDGET_EXCEEDED",
      "Funding exceeds the total campaign budget.",
      409,
    );
    const availableId = `advertiser:${ownerId}`;
    await account(tx, availableId, "ADVERTISER_AVAILABLE", { userId: ownerId });
    await account(tx, `campaign:${campaignId}`, "CAMPAIGN_ESCROW", { campaignId });
    if (development) {
      await account(tx, "platform:cash-clearing", "CASH_CLEARING");
      await postLedger(tx, {
        key: key + ":deposit",
        kind: "DEMO_DEPOSIT",
        referenceId: campaignId,
        description: "Development advertiser funding; no real payment collected",
        isDemo: true,
        entries: [
          { accountId: "platform:cash-clearing", amountMinor: -value.amountMinor },
          { accountId: availableId, amountMinor: value.amountMinor },
        ],
      });
    }
    const simulated =
      development ||
      campaign.isDemo ||
      (await tx.ledgerEntry.count({
        where: { accountId: availableId, transaction: { isDemo: true } },
      })) > 0;
    assert(
      isDevelopment() || !simulated,
      "DEMO_PRODUCTION_BLOCKED",
      "Simulated funds cannot finance staging or production campaigns.",
      403,
    );
    const transaction = await postLedger(tx, {
      key,
      kind: "CAMPAIGN_FUND",
      referenceId: campaignId,
      description: "Reserve advertiser funds for campaign media",
      isDemo: simulated,
      entries: [
        { accountId: availableId, amountMinor: -value.amountMinor },
        { accountId: `campaign:${campaignId}`, amountMinor: value.amountMinor },
      ],
    });
    if (simulated) await tx.campaign.update({ where: { id: campaignId }, data: { isDemo: true } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CAMPAIGN_FUNDED",
        targetId: campaignId,
        details: jsonValue({
          source: value.source,
          amountMinor: value.amountMinor,
          transactionId: transaction.id,
        }),
      },
    });
    return { transaction, isDemo: simulated };
  });
}
export async function submitCampaign(user: User, campaignId: string, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "MANAGE_CAMPAIGNS");
  return atomic(async (tx) => {
    await assertEligible(tx, ctx.ownerId);
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      campaign && campaign.advertiserId === ctx.ownerId,
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
    if (updated.state === "ACTIVE") {
      await notifyMatchingCreatorsForCampaign(tx, updated);
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CAMPAIGN_SUBMITTED",
        targetId: campaignId,
        details: { state: updated.state, workspaceOwnerId: ctx.ownerId },
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
    const reviewer = await tx.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert(
      reviewer.roles.includes("ADMIN") && !reviewer.suspended && !reviewer.economicHold,
      "FORBIDDEN",
      "An active administrator is required.",
      403,
    );
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
    await notifyUser(tx, {
      userId: campaign.advertiserId,
      kind: value.decision === "APPROVE" ? "CAMPAIGN_APPROVED" : "CAMPAIGN_REJECTED",
      titleKey:
        value.decision === "APPROVE" ? "p4NotifCampaignApproved" : "p4NotifCampaignRejected",
      bodyParams: { campaign: campaign.name },
      href: "/app/advertiser",
    });
    if (value.decision === "APPROVE") {
      await notifyMatchingCreatorsForCampaign(tx, updated);
    }
    return { campaign: updated };
  });
}
export async function transitionCampaign(
  user: User,
  campaignId: string,
  input: unknown,
  workspaceId?: string,
) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "MANAGE_CAMPAIGNS");
  const value = z
    .object({ action: z.enum(["PAUSE", "RESUME"]), reason: reason.optional() })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    await assertEligible(tx, ctx.ownerId);
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      campaign && campaign.advertiserId === ctx.ownerId,
      "CAMPAIGN_NOT_FOUND",
      "Campaign not found.",
      404,
    );
    if (value.action === "PAUSE") {
      assert(
        campaign.state === "ACTIVE",
        "INVALID_CAMPAIGN_STATE",
        "Only active campaigns can be paused.",
        409,
      );
    } else {
      assert(
        campaign.state === "PAUSED",
        "INVALID_CAMPAIGN_STATE",
        "Only paused campaigns can be resumed.",
        409,
      );
      assert(
        campaign.endAt > new Date() &&
          (await balance(tx, `campaign:${campaignId}`)) >= campaign.unitCostMinor,
        "CAMPAIGN_INELIGIBLE",
        "The campaign must have remaining budget and a future end date to resume.",
        409,
      );
    }
    const nextState = value.action === "PAUSE" ? "PAUSED" : "ACTIVE";
    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: { state: nextState },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: value.action === "PAUSE" ? "CAMPAIGN_PAUSED" : "CAMPAIGN_RESUMED",
        targetId: campaignId,
        details: {
          state: nextState,
          workspaceOwnerId: ctx.ownerId,
          ...(value.reason ? { reason: value.reason } : {}),
        },
      },
    });
    return { campaign: updated };
  });
}

export async function duplicateCampaign(user: User, campaignId: string, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "MANAGE_CAMPAIGNS");
  return atomic(async (tx) => {
    await assertEligible(tx, ctx.ownerId);
    const source = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      source && source.advertiserId === ctx.ownerId,
      "CAMPAIGN_NOT_FOUND",
      "Campaign not found.",
      404,
    );
    const now = new Date();
    const durationMs = Math.max(
      7 * 24 * 60 * 60 * 1000,
      source.endAt.getTime() - source.startAt.getTime(),
    );
    const copyName = `${source.name.slice(0, 68)} (Copy)`.slice(0, 80);
    const created = await tx.campaign.create({
      data: {
        advertiserId: ctx.ownerId,
        name: copyName,
        description: source.description,
        objective: source.objective,
        destinationUrl: source.destinationUrl,
        budgetMinor: source.budgetMinor,
        dailyBudgetMinor: source.dailyBudgetMinor,
        unitCostMinor: source.unitCostMinor,
        currency: source.currency,
        state: "DRAFT",
        startAt: now,
        endAt: new Date(now.getTime() + durationMs),
        frequencyCap: source.frequencyCap,
        maxActivitiesPerCreator: source.maxActivitiesPerCreator,
        isTemplate: false,
        allowedCountries: source.allowedCountries,
        creatorCategories: source.creatorCategories,
        minimumCreatorFollowers: source.minimumCreatorFollowers,
        maximumCreatorFollowers: source.maximumCreatorFollowers,
        allowedCities: source.allowedCities,
        allowedLanguages: source.allowedLanguages,
        allowedPlatforms: source.allowedPlatforms,
        requireVerifiedAudience: source.requireVerifiedAudience,
        minimumReliabilityScore: source.minimumReliabilityScore,
        deliveryMode: source.deliveryMode,
        creativeBrief: source.creativeBrief ?? undefined,
        abVariants: source.abVariants ?? undefined,
        smartRouting: source.smartRouting ?? undefined,
        isDemo: source.isDemo,
      },
    });
    await account(tx, `campaign:${created.id}`, "CAMPAIGN_ESCROW", { campaignId: created.id });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CAMPAIGN_DUPLICATED",
        targetId: created.id,
        details: { sourceCampaignId: source.id, workspaceOwnerId: ctx.ownerId },
      },
    });
    return { campaign: created };
  });
}

const estimateSchema = z
  .object({
    allowedCountries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(250)
      .default([]),
    allowedCities: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    allowedLanguages: z
      .array(z.enum(["fr", "en", "es", "de", "it", "pt"]))
      .max(10)
      .default([]),
    allowedPlatforms: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
    creatorCategories: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    minimumCreatorFollowers: z.number().int().min(0).max(1000000000).default(0),
    maximumCreatorFollowers: z.number().int().min(0).max(1000000000).nullable().optional(),
    requireVerifiedAudience: z.boolean().default(false),
    minimumReliabilityScore: z.number().int().min(0).max(100).default(0),
    budgetMinor: positiveMinor.optional(),
    unitCostMinor: positiveMinor.optional(),
  })
  .strict();

export async function estimateCampaignAudience(user: User, input: unknown, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "VIEW");
  const criteria = estimateSchema.parse(input);
  const candidates = await db.user.findMany({
    where: {
      onboarded: true,
      suspended: false,
      economicHold: false,
      anonymizedAt: null,
      id: { not: ctx.ownerId },
      ...(isDevelopment() ? {} : { isDemo: false }),
    },
    select: {
      id: true,
      roles: true,
      followers: true,
      category: true,
      country: true,
      city: true,
      preferredLanguages: true,
      socialLinks: true,
      audienceStatus: true,
      emailVerifiedAt: true,
      suspended: true,
      economicHold: true,
    },
    take: 500,
  });

  const matchingParticipants = candidates.filter((candidate) =>
    campaignRegionAllowed(candidate, criteria),
  );
  const creatorCandidates = matchingParticipants.filter((candidate) =>
    canCreatorPromote(candidate, criteria),
  );

  let matchingCreators = creatorCandidates;
  if (criteria.minimumReliabilityScore > 0 && creatorCandidates.length > 0) {
    const scored = await Promise.all(
      creatorCandidates.map(async (creator) => ({
        creator,
        reliability: await getCreatorReliability(db, creator),
      })),
    );
    matchingCreators = scored
      .filter((row) => row.reliability.reliabilityScore >= criteria.minimumReliabilityScore)
      .map((row) => row.creator);
  }

  const verifiedCreators = matchingCreators.filter((c) => c.audienceStatus === "VERIFIED").length;
  const totalFollowersReach = matchingCreators.reduce((sum, c) => sum + c.followers, 0);
  const estimatedMaxActions =
    criteria.budgetMinor && criteria.unitCostMinor && criteria.unitCostMinor > 0n
      ? Number(criteria.budgetMinor / criteria.unitCostMinor)
      : null;

  return {
    matchingCreators: matchingCreators.length,
    verifiedCreators,
    matchingParticipants: matchingParticipants.length,
    totalFollowersReach,
    estimatedMaxActions,
  };
}

export async function listCampaigns(
  user?: User | null,
  options: {
    forCreator?: boolean;
    objective?: string;
    category?: string;
    workspaceId?: string;
    cursor?: string;
    limit?: number;
    userAgent?: string | null;
    acceptLanguage?: string | null;
  } = {},
) {
  let activeWorkspaceOwnerId: string | null = null;
  if (user && options.workspaceId) {
    const resolved = await resolveAdvertiserWorkspace(user, options.workspaceId, "VIEW");
    activeWorkspaceOwnerId = resolved.ownerId;
  } else if (user?.roles.includes("ADVERTISER")) {
    activeWorkspaceOwnerId = user.id;
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const [rule, reliability] = await Promise.all([
    user ? activeRules(db).catch(() => null) : Promise.resolve(null),
    user && options.forCreator ? getCreatorReliability(db, user) : Promise.resolve(null),
  ]);
  const campaigns = await db.campaign.findMany({
    where: activeWorkspaceOwnerId
      ? options.workspaceId
        ? { advertiserId: activeWorkspaceOwnerId }
        : { OR: [{ advertiserId: activeWorkspaceOwnerId }, { state: "ACTIVE" }] }
      : { state: "ACTIVE" },
    include: { event: { select: { id: true, title: true, slug: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasMore = campaigns.length > limit;
  const pageRaw = hasMore ? campaigns.slice(0, limit) : campaigns;

  const filtered = pageRaw.filter((campaign) => {
    if (
      (activeWorkspaceOwnerId && campaign.advertiserId === activeWorkspaceOwnerId) ||
      user?.roles.includes("ADMIN")
    )
      return true;
    if (
      user &&
      (!rule ||
        !evaluatePersistedPolicy(user, "PARTICIPATION", rule.config).eligible ||
        !campaignRegionAllowed(user, campaign))
    )
      return false;
    if (
      options.forCreator &&
      (!user || !canCreatorPromote(user, campaign, reliability?.reliabilityScore))
    )
      return false;
    if (options.objective && campaign.objective !== options.objective) return false;
    if (
      options.category &&
      campaign.creatorCategories.length > 0 &&
      !campaign.creatorCategories.some((v) => v.toLowerCase() === options.category!.toLowerCase())
    )
      return false;
    return true;
  });
  const campaignIds = filtered.map((campaign) => campaign.id);
  const accountIds = campaignIds.map((id) => `campaign:${id}`);
  const [balances, validatedCounts, creatorPromoCodes] = campaignIds.length
    ? await Promise.all([
        db.ledgerEntry.groupBy({
          by: ["accountId"],
          where: { accountId: { in: accountIds } },
          _sum: { amountMinor: true },
        }),
        db.activity.groupBy({
          by: ["campaignId"],
          where: { campaignId: { in: campaignIds }, state: "VALIDATED" },
          _count: true,
        }),
        user?.roles.includes("CREATOR")
          ? db.promoCode.findMany({
              where: { creatorId: user.id, campaignId: { in: campaignIds }, active: true },
              select: { campaignId: true, code: true, discountLabel: true, usesCount: true },
            })
          : Promise.resolve([]),
      ])
    : [[], [], []];
  const balanceMap = new Map(balances.map((row) => [row.accountId, row._sum.amountMinor ?? 0n]));
  const countMap = new Map(validatedCounts.map((row) => [row.campaignId, row._count]));
  const promoMap = new Map(creatorPromoCodes.map((row) => [row.campaignId, row]));
  const now = new Date();
  const mapped = filtered.map((campaign) => {
    const remainingMinor = balanceMap.get(`campaign:${campaign.id}`) ?? 0n;
    const budgetRemainingPct =
      campaign.budgetMinor > 0n
        ? Math.max(0, Math.min(100, Number((remainingMinor * 100n) / campaign.budgetMinor)))
        : 0;
    const relevanceScore = campaignRelevanceScore(user, campaign);
    const canParticipate =
      campaign.state === "ACTIVE" &&
      campaign.startAt <= now &&
      campaign.endAt > now &&
      remainingMinor >= campaign.unitCostMinor &&
      campaign.advertiserId !== user?.id;
    const creatorPromoCode = promoMap.get(campaign.id) ?? null;
    const resolved = resolveSmartDestination({
      destinationUrl: campaign.destinationUrl,
      smartRouting: campaign.smartRouting,
      userAgent: options.userAgent,
      acceptLanguage: options.acceptLanguage,
    });
    if (
      (activeWorkspaceOwnerId && campaign.advertiserId === activeWorkspaceOwnerId) ||
      user?.roles.includes("ADMIN")
    )
      return {
        ...campaign,
        resolvedDestinationUrl: resolved.url,
        resolvedRouteTarget: resolved.routeTarget,
        remainingMinor,
        budgetRemainingPct,
        relevanceScore,
        canParticipate,
        creatorPromoCode,
        validatedCount: countMap.get(campaign.id) ?? 0,
      };
    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      objective: campaign.objective,
      deliveryMode: campaign.deliveryMode,
      destinationUrl: campaign.destinationUrl,
      smartRouting: campaign.smartRouting,
      resolvedDestinationUrl: resolved.url,
      resolvedRouteTarget: resolved.routeTarget,
      creativeBrief: campaign.creativeBrief,
      abVariants: campaign.abVariants,
      allowedCountries: campaign.allowedCountries,
      allowedCities: campaign.allowedCities,
      allowedLanguages: campaign.allowedLanguages,
      allowedPlatforms: campaign.allowedPlatforms,
      creatorCategories: campaign.creatorCategories,
      minimumCreatorFollowers: campaign.minimumCreatorFollowers,
      maximumCreatorFollowers: campaign.maximumCreatorFollowers,
      requireVerifiedAudience: campaign.requireVerifiedAudience,
      maxActivitiesPerCreator: campaign.maxActivitiesPerCreator,
      state: campaign.state,
      startAt: campaign.startAt,
      endAt: campaign.endAt,
      eventId: campaign.eventId,
      event: campaign.event,
      isDemo: campaign.isDemo,
      budgetRemainingPct,
      relevanceScore,
      creatorPromoCode,
      canParticipate,
    };
  });
  mapped.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return {
    campaigns: mapped,
    nextCursor: hasMore ? pageRaw[pageRaw.length - 1]!.id : null,
  };
}
