import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, jsonValue } from "./db";
import { assert } from "./errors";
import { requireRole } from "./auth";
import { requireFreshMfa } from "./security/mfa";
import { notifyUser } from "./notifications";

const fileDisputeSchema = z
  .object({
    reason: z.string().trim().min(10).max(600),
    evidenceNote: z.string().trim().max(1000).optional(),
    attachmentId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

const resolveDisputeSchema = z
  .object({
    decision: z.enum(["UPHOLD_REJECTION", "OVERTURN_AND_REOPEN"]),
    resolutionNote: z.string().trim().min(8).max(600),
  })
  .strict();

export async function fileActivityDispute(user: User, activityId: string, input: unknown) {
  const value = fileDisputeSchema.parse(input);
  return atomic(async (tx) => {
    const activity = await tx.activity.findUnique({
      where: { id: activityId },
      include: { campaign: { select: { name: true } }, dispute: true },
    });
    assert(activity, "ACTIVITY_NOT_FOUND", "Activity not found.", 404);
    assert(
      activity.userId === user.id || activity.creatorId === user.id,
      "FORBIDDEN",
      "You can only dispute your own rejected activity.",
      403,
    );
    assert(
      activity.state === "REJECTED",
      "ACTIVITY_NOT_DISPUTABLE",
      "Only rejected activities can be disputed.",
      409,
    );
    assert(
      !activity.dispute,
      "DISPUTE_ALREADY_EXISTS",
      "A dispute has already been filed for this activity.",
      409,
    );

    if (value.attachmentId) {
      const att = await tx.evidenceAttachment.findUnique({ where: { id: value.attachmentId } });
      assert(
        att && att.ownerId === user.id,
        "ATTACHMENT_NOT_FOUND",
        "Evidence attachment not found.",
        404,
      );
    }

    const created = await tx.activityDispute.create({
      data: {
        activityId: activity.id,
        creatorId: user.id,
        reason: value.reason,
        evidenceNote: value.evidenceNote ?? "",
        attachmentId: value.attachmentId ?? null,
        originalReviewerId: activity.reviewedById,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ACTIVITY_DISPUTE_FILED",
        targetId: created.id,
        details: jsonValue({
          activityId: activity.id,
          originalReviewerId: activity.reviewedById,
          hasAttachment: Boolean(value.attachmentId),
        }),
      },
    });

    return {
      id: created.id,
      activityId: created.activityId,
      state: created.state,
      reason: created.reason,
      createdAt: created.createdAt.toISOString(),
    };
  });
}

/**
 * Four-eyes appeal resolution:
 * - Enforces resolver !== originalReviewerId whenever the initial reviewer was recorded.
 * - Preserves immutable rejected Activity history (`ruvora_guard_activity`) by creating
 *   a linked compensating PENDING_VALIDATION Activity on OVERTURN_AND_REOPEN.
 */
export async function resolveActivityDispute(
  admin: User,
  sessionToken: string | undefined,
  disputeId: string,
  input: unknown,
) {
  requireRole(admin, "ADMIN");
  await requireFreshMfa(admin, sessionToken);
  const value = resolveDisputeSchema.parse(input);

  return atomic(async (tx) => {
    const dispute = await tx.activityDispute.findUnique({
      where: { id: disputeId },
      include: { activity: { include: { campaign: true } } },
    });
    assert(dispute, "DISPUTE_NOT_FOUND", "Dispute not found.", 404);
    assert(
      dispute.state === "OPEN",
      "DISPUTE_ALREADY_RESOLVED",
      "Dispute is already resolved.",
      409,
    );
    assert(
      dispute.creatorId !== admin.id,
      "SELF_APPROVAL",
      "You cannot resolve your own dispute.",
      403,
    );
    if (dispute.originalReviewerId) {
      assert(
        dispute.originalReviewerId !== admin.id,
        "FOUR_EYES_REQUIRED",
        "A different independent administrator must review an activity appeal.",
        403,
      );
    }

    let reopenedActivityId: string | null = null;
    if (value.decision === "OVERTURN_AND_REOPEN") {
      const orig = dispute.activity;
      const reopened = await tx.activity.create({
        data: {
          idempotencyKey: `dispute-reopen:${dispute.id}:${randomUUID().slice(0, 8)}`,
          userId: orig.userId,
          creatorId: orig.creatorId,
          campaignId: orig.campaignId,
          eventId: orig.eventId,
          type: orig.type,
          state: "PENDING_VALIDATION",
          evidence: [
            orig.evidence ?? "",
            `[Appeal ${dispute.id}]: ${dispute.reason}`,
            dispute.evidenceNote,
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 2000),
          attributionId: orig.attributionId,
          attributionSnapshot: orig.attributionSnapshot ?? undefined,
          requestFingerprint: orig.requestFingerprint,
          riskScore: Math.max(0, orig.riskScore - 15),
          riskSignals: jsonValue({
            appealOverturnedBy: admin.id,
            originalActivityId: orig.id,
          }),
          abVariantId: orig.abVariantId,
          promoCodeUsed: orig.promoCodeUsed,
          disputeOriginActivityId: orig.id,
        },
      });
      reopenedActivityId = reopened.id;
    }

    const updated = await tx.activityDispute.update({
      where: { id: dispute.id },
      data: {
        state: value.decision === "OVERTURN_AND_REOPEN" ? "OVERTURNED" : "UPHELD_REJECTION",
        resolvedById: admin.id,
        resolutionNote: value.resolutionNote,
        reopenedActivityId,
        resolvedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action:
          value.decision === "OVERTURN_AND_REOPEN"
            ? "ACTIVITY_DISPUTE_OVERTURNED"
            : "ACTIVITY_DISPUTE_UPHELD",
        targetId: dispute.id,
        details: jsonValue({
          activityId: dispute.activityId,
          reopenedActivityId,
          originalReviewerId: dispute.originalReviewerId,
          resolutionNote: value.resolutionNote,
        }),
      },
    });

    await notifyUser(tx, {
      userId: dispute.creatorId,
      kind: value.decision === "OVERTURN_AND_REOPEN" ? "DISPUTE_OVERTURNED" : "DISPUTE_UPHELD",
      titleKey:
        value.decision === "OVERTURN_AND_REOPEN"
          ? "p5NotifDisputeOverturned"
          : "p5NotifDisputeUpheld",
      bodyParams: { campaign: dispute.activity.campaign.name },
      href: "/app/activity",
    });

    return {
      id: updated.id,
      state: updated.state,
      reopenedActivityId,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    };
  });
}

export async function listActivityDisputes(
  user: User,
  options?: { scope?: "self" | "admin"; cursor?: string; limit?: number },
) {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const isAdminScope = options?.scope === "admin" && user.roles.includes("ADMIN");
  const rows = await db.activityDispute.findMany({
    where: isAdminScope ? undefined : { creatorId: user.id },
    include: {
      activity: {
        select: {
          id: true,
          state: true,
          reviewReason: true,
          evidence: true,
          campaign: { select: { id: true, name: true } },
        },
      },
      creator: { select: { id: true, displayName: true, handle: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((item) => ({
      id: item.id,
      activityId: item.activityId,
      campaignName: item.activity.campaign.name,
      creator: item.creator,
      reason: item.reason,
      evidenceNote: item.evidenceNote,
      attachmentId: item.attachmentId,
      state: item.state,
      originalReviewerId: item.originalReviewerId,
      resolutionNote: item.resolutionNote,
      reopenedActivityId: item.reopenedActivityId,
      createdAt: item.createdAt.toISOString(),
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}
