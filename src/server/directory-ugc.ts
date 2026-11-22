import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, jsonValue } from "./db";
import { assert } from "./errors";
import { safeUrl } from "./validation";
import { computeReliabilityFromCounts } from "./risk";
import { notifyUser } from "./notifications";
import { resolveAdvertiserWorkspace } from "./workspaces";

const inviteSchema = z
  .object({
    creatorId: z.string().trim().min(1).max(128),
    message: z.string().trim().max(500).default(""),
  })
  .strict();

const respondInviteSchema = z
  .object({
    decision: z.enum(["ACCEPTED", "DECLINED"]),
  })
  .strict();

const ugcApplySchema = z
  .object({
    pitch: z.string().trim().min(8).max(800),
  })
  .strict();

const ugcDraftSchema = z
  .object({
    draftUrl: safeUrl,
    publishedUrl: safeUrl.optional(),
  })
  .strict();

const ugcReviewSchema = z
  .object({
    action: z.enum(["APPROVE_TO_CREATE", "REQUEST_REVISION", "ACCEPT", "DECLINE"]),
    feedback: z.string().trim().max(500).optional(),
  })
  .strict();

export async function searchCreatorDirectory(
  user: User,
  filters: {
    city?: string;
    language?: string;
    platform?: string;
    category?: string;
    minFollowers?: number;
    maxFollowers?: number;
    verifiedOnly?: boolean;
    minReliability?: number;
    cursor?: string;
    limit?: number;
    workspaceId?: string;
  },
) {
  const ws = await resolveAdvertiserWorkspace(user, filters.workspaceId, "VIEW");
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);

  const candidates = await db.user.findMany({
    where: {
      id: { notIn: [user.id, ws.ownerId] },
      onboarded: true,
      suspended: false,
      anonymizedAt: null,
      directoryOptIn: true,
      handle: { not: null },
      followers: {
        gte: filters.minFollowers ?? 10,
        ...(filters.maxFollowers !== undefined ? { lte: filters.maxFollowers } : {}),
      },
      ...(filters.verifiedOnly ? { audienceStatus: "VERIFIED" } : {}),
      ...(filters.city ? { city: { contains: filters.city.trim(), mode: "insensitive" } } : {}),
      ...(filters.category
        ? { category: { contains: filters.category.trim(), mode: "insensitive" } }
        : {}),
      ...(filters.language ? { preferredLanguages: { has: filters.language.toLowerCase() } } : {}),
    },
    select: {
      id: true,
      displayName: true,
      handle: true,
      bio: true,
      category: true,
      country: true,
      city: true,
      preferredLanguages: true,
      followers: true,
      audienceStatus: true,
      audienceVerifiedPlatform: true,
      emailVerifiedAt: true,
      socialLinks: true,
      profileTheme: true,
    },
    orderBy: [{ followers: "desc" }, { id: "asc" }],
    take: limit * 3,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const ids = candidates.map((c) => c.id);
  const actCounts = ids.length
    ? await db.activity.groupBy({
        by: ["userId", "state"],
        where: { userId: { in: ids } },
        _count: { _all: true },
      })
    : [];

  const countMap = new Map<string, { validated: number; rejected: number; reversed: number }>();
  for (const row of actCounts) {
    const entry = countMap.get(row.userId) ?? { validated: 0, rejected: 0, reversed: 0 };
    if (row.state === "VALIDATED") entry.validated += row._count._all;
    else if (row.state === "REJECTED") entry.rejected += row._count._all;
    else if (row.state === "REVERSED") entry.reversed += row._count._all;
    countMap.set(row.userId, entry);
  }

  const platformNeedle = filters.platform?.trim().toLowerCase();
  const minRel = filters.minReliability ?? 0;

  const filtered = candidates
    .map((creator) => {
      const counts = countMap.get(creator.id) ?? { validated: 0, rejected: 0, reversed: 0 };
      const rel = computeReliabilityFromCounts({
        validatedCount: counts.validated,
        rejectedCount: counts.rejected,
        reversedCount: counts.reversed,
        audienceVerified: creator.audienceStatus === "VERIFIED",
        emailVerified: Boolean(creator.emailVerifiedAt),
      });
      const socials = Array.isArray(creator.socialLinks)
        ? (creator.socialLinks as { platform?: string; url?: string }[])
        : [];
      const platforms = socials.map((s) => String(s.platform ?? "").trim()).filter(Boolean);
      return {
        ...creator,
        platforms,
        reliabilityScore: rel.reliabilityScore,
        trustTier: rel.tier,
        validatedCount: counts.validated,
      };
    })
    .filter((item) => {
      if (item.reliabilityScore < minRel) return false;
      if (platformNeedle && !item.platforms.some((p) => p.toLowerCase().includes(platformNeedle))) {
        return false;
      }
      return true;
    });

  const hasMore = filtered.length > limit;
  const page = hasMore ? filtered.slice(0, limit) : filtered;
  return {
    items: page,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function sendCampaignInvitation(
  user: User,
  campaignId: string,
  input: unknown,
  workspaceId?: string,
) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "MANAGE_CAMPAIGNS");
  const value = inviteSchema.parse(input);

  return atomic(async (tx) => {
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      campaign && campaign.advertiserId === ctx.ownerId,
      "CAMPAIGN_NOT_FOUND",
      "Campaign not found.",
      404,
    );
    assert(
      campaign.state === "ACTIVE" || campaign.state === "PENDING_REVIEW",
      "CAMPAIGN_NOT_INVITABLE",
      "Only active or pending campaigns can invite creators.",
      409,
    );

    const creator = await tx.user.findUnique({ where: { id: value.creatorId } });
    assert(
      creator && !creator.suspended && creator.directoryOptIn,
      "CREATOR_NOT_AVAILABLE",
      "Creator is not available in the directory.",
      404,
    );
    assert(creator.id !== ctx.ownerId, "SELF_INVITATION", "You cannot invite yourself.", 400);

    const invitation = await tx.campaignInvitation.upsert({
      where: { campaignId_creatorId: { campaignId, creatorId: creator.id } },
      create: {
        campaignId,
        advertiserId: ctx.ownerId,
        creatorId: creator.id,
        message: value.message,
        state: "PENDING",
      },
      update: {
        message: value.message,
        state: "PENDING",
        respondedAt: null,
      },
    });

    await notifyUser(tx, {
      userId: creator.id,
      kind: "CAMPAIGN_INVITATION",
      titleKey: "p5NotifCampaignInvite",
      bodyParams: { campaign: campaign.name },
      href: "/app/opportunities",
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CAMPAIGN_INVITATION_SENT",
        targetId: invitation.id,
        details: jsonValue({ campaignId, creatorId: creator.id, workspaceOwnerId: ctx.ownerId }),
      },
    });

    return {
      id: invitation.id,
      campaignId: invitation.campaignId,
      creatorId: invitation.creatorId,
      state: invitation.state,
      createdAt: invitation.createdAt.toISOString(),
    };
  });
}

export async function listCreatorInvitations(user: User) {
  const rows = await db.campaignInvitation.findMany({
    where: { creatorId: user.id },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          description: true,
          deliveryMode: true,
          state: true,
          objective: true,
        },
      },
      advertiser: { select: { id: true, displayName: true, handle: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((row) => ({
    id: row.id,
    state: row.state,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    campaign: row.campaign,
    advertiser: row.advertiser,
  }));
}

export async function respondCampaignInvitation(user: User, invitationId: string, input: unknown) {
  const value = respondInviteSchema.parse(input);
  return atomic(async (tx) => {
    const inv = await tx.campaignInvitation.findUnique({
      where: { id: invitationId },
      include: { campaign: { select: { name: true } } },
    });
    assert(inv && inv.creatorId === user.id, "INVITATION_NOT_FOUND", "Invitation not found.", 404);
    assert(
      inv.state === "PENDING",
      "INVITATION_ALREADY_RESPONDED",
      "Invitation was already answered.",
      409,
    );

    const updated = await tx.campaignInvitation.update({
      where: { id: inv.id },
      data: { state: value.decision, respondedAt: new Date() },
    });

    await notifyUser(tx, {
      userId: inv.advertiserId,
      kind: value.decision === "ACCEPTED" ? "INVITATION_ACCEPTED" : "INVITATION_DECLINED",
      titleKey: value.decision === "ACCEPTED" ? "p5NotifInviteAccepted" : "p5NotifInviteDeclined",
      bodyParams: { creator: user.displayName, campaign: inv.campaign.name },
      href: "/app/advertiser",
    });

    return { id: updated.id, state: updated.state };
  });
}

// === Structured UGC Brief Deliverables Workflow ===

export async function applyUgcBrief(user: User, campaignId: string, input: unknown) {
  const value = ugcApplySchema.parse(input);
  return atomic(async (tx) => {
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    assert(
      campaign && campaign.state === "ACTIVE",
      "CAMPAIGN_NOT_ACTIVE",
      "Campaign is not active.",
      404,
    );
    assert(
      campaign.deliveryMode === "UGC_BRIEF",
      "NOT_UGC_CAMPAIGN",
      "This campaign does not use the UGC deliverable workflow.",
      400,
    );
    assert(
      campaign.advertiserId !== user.id,
      "SELF_PARTICIPATION",
      "Advertisers cannot apply to their own UGC brief.",
      403,
    );

    const deliverable = await tx.ugcDeliverable.upsert({
      where: { campaignId_creatorId: { campaignId, creatorId: user.id } },
      create: {
        campaignId,
        creatorId: user.id,
        state: "APPLIED",
        pitch: value.pitch,
      },
      update: {
        pitch: value.pitch,
        state: "APPLIED",
      },
    });

    await notifyUser(tx, {
      userId: campaign.advertiserId,
      kind: "UGC_APPLICATION",
      titleKey: "p5NotifUgcApplied",
      bodyParams: { creator: user.displayName, campaign: campaign.name },
      href: "/app/advertiser",
    });

    return serializeDeliverable(deliverable);
  });
}

export async function submitUgcDraft(user: User, deliverableId: string, input: unknown) {
  const value = ugcDraftSchema.parse(input);
  return atomic(async (tx) => {
    const deliv = await tx.ugcDeliverable.findUnique({
      where: { id: deliverableId },
      include: { campaign: { select: { name: true, advertiserId: true } } },
    });
    assert(
      deliv && deliv.creatorId === user.id,
      "DELIVERABLE_NOT_FOUND",
      "UGC deliverable not found.",
      404,
    );
    assert(
      deliv.state === "APPROVED_TO_CREATE" || deliv.state === "REVISION_REQUESTED",
      "DELIVERABLE_INVALID_STATE",
      "Deliverable is not awaiting a draft submission.",
      409,
    );

    const updated = await tx.ugcDeliverable.update({
      where: { id: deliv.id },
      data: {
        state: "DRAFT_SUBMITTED",
        draftUrl: value.draftUrl,
        ...(value.publishedUrl ? { publishedUrl: value.publishedUrl } : {}),
      },
    });

    await notifyUser(tx, {
      userId: deliv.campaign.advertiserId,
      kind: "UGC_DRAFT_SUBMITTED",
      titleKey: "p5NotifUgcDraft",
      bodyParams: { creator: user.displayName, campaign: deliv.campaign.name },
      href: "/app/advertiser",
    });

    return serializeDeliverable(updated);
  });
}

export async function reviewUgcDeliverable(
  user: User,
  deliverableId: string,
  input: unknown,
  workspaceId?: string,
) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "MANAGE_CAMPAIGNS");
  const value = ugcReviewSchema.parse(input);

  return atomic(async (tx) => {
    const deliv = await tx.ugcDeliverable.findUnique({
      where: { id: deliverableId },
      include: { campaign: { select: { id: true, name: true, advertiserId: true } } },
    });
    assert(
      deliv && deliv.campaign.advertiserId === ctx.ownerId,
      "DELIVERABLE_NOT_FOUND",
      "UGC deliverable not found.",
      404,
    );

    let nextState = deliv.state;
    if (value.action === "APPROVE_TO_CREATE") {
      assert(
        deliv.state === "APPLIED",
        "DELIVERABLE_INVALID_STATE",
        "Only applications can be approved to create.",
        409,
      );
      nextState = "APPROVED_TO_CREATE";
    } else if (value.action === "REQUEST_REVISION") {
      assert(
        deliv.state === "DRAFT_SUBMITTED",
        "DELIVERABLE_INVALID_STATE",
        "Only submitted drafts can request revision.",
        409,
      );
      nextState = "REVISION_REQUESTED";
    } else if (value.action === "ACCEPT") {
      assert(
        deliv.state === "DRAFT_SUBMITTED",
        "DELIVERABLE_INVALID_STATE",
        "Only submitted drafts can be accepted.",
        409,
      );
      nextState = "ACCEPTED";
    } else if (value.action === "DECLINE") {
      assert(
        deliv.state !== "ACCEPTED",
        "DELIVERABLE_INVALID_STATE",
        "Accepted deliverables cannot be declined.",
        409,
      );
      nextState = "DECLINED";
    }

    const updated = await tx.ugcDeliverable.update({
      where: { id: deliv.id },
      data: {
        state: nextState,
        ...(value.feedback !== undefined ? { feedback: value.feedback } : {}),
      },
    });

    await notifyUser(tx, {
      userId: deliv.creatorId,
      kind: `UGC_${nextState}`,
      titleKey:
        nextState === "ACCEPTED"
          ? "p5NotifUgcAccepted"
          : nextState === "APPROVED_TO_CREATE"
            ? "p5NotifUgcApproved"
            : "p5NotifUgcRevision",
      bodyParams: { campaign: deliv.campaign.name },
      href: "/app/opportunities",
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: `UGC_DELIVERABLE_${nextState}`,
        targetId: deliv.id,
        details: jsonValue({ campaignId: deliv.campaignId, creatorId: deliv.creatorId }),
      },
    });

    return serializeDeliverable(updated);
  });
}

export async function listUgcDeliverables(
  user: User,
  options?: { scope?: "creator" | "advertiser"; workspaceId?: string },
) {
  if (options?.scope === "advertiser") {
    const ctx = await resolveAdvertiserWorkspace(user, options.workspaceId, "VIEW");
    const rows = await db.ugcDeliverable.findMany({
      where: { campaign: { advertiserId: ctx.ownerId } },
      include: {
        campaign: { select: { id: true, name: true } },
        creator: {
          select: {
            id: true,
            displayName: true,
            handle: true,
            followers: true,
            audienceStatus: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return rows.map((row) => ({
      ...serializeDeliverable(row),
      campaign: row.campaign,
      creator: row.creator,
    }));
  }

  const rows = await db.ugcDeliverable.findMany({
    where: { creatorId: user.id },
    include: { campaign: { select: { id: true, name: true, deliveryMode: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => ({
    ...serializeDeliverable(row),
    campaign: row.campaign,
  }));
}

function serializeDeliverable(row: {
  id: string;
  campaignId: string;
  creatorId: string;
  state: string;
  pitch: string;
  draftUrl: string | null;
  publishedUrl: string | null;
  feedback: string | null;
  activityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    creatorId: row.creatorId,
    state: row.state,
    pitch: row.pitch,
    draftUrl: row.draftUrl,
    publishedUrl: row.publishedUrl,
    feedback: row.feedback,
    activityId: row.activityId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
