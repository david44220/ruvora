import { randomUUID } from "node:crypto";
import type { WebhookEvent } from "@prisma/client";
import { z } from "zod";
import type { Tx } from "../db";
import { assert } from "../errors";
const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
const conversionPayload = z
  .object({
    activityId: identifier,
    campaignId: identifier,
    externalConversionId: identifier,
    convertedAt: z.iso.datetime(),
    valueMinor: z
      .string()
      .regex(/^\d{1,15}$/)
      .optional(),
    currency: z.literal("EUR").default("EUR"),
  })
  .strict();
export async function getConversionDecision(
  tx: Tx,
  activityId: string,
  campaignId: string,
): Promise<"VERIFIED" | "REJECTED" | "REVERSED" | null> {
  const records = await tx.providerConversion.findMany({
    where: { activityId, campaignId },
    select: { decision: true },
  });
  if (records.some((item) => item.decision === "REVERSED")) return "REVERSED";
  if (records.some((item) => item.decision === "REJECTED")) return "REJECTED";
  return records.some((item) => item.decision === "VERIFIED") ? "VERIFIED" : null;
}
export async function hasVerifiedConversion(tx: Tx, activityId: string, campaignId: string) {
  return (await getConversionDecision(tx, activityId, campaignId)) === "VERIFIED";
}
/** Only the verified inbox processor calls this; provider evidence never impersonates an administrator. */
export async function processConversionCallback(tx: Tx, event: WebhookEvent) {
  const decisions: Record<string, "VERIFIED" | "REJECTED" | "REVERSED"> = {
    "conversion.verified": "VERIFIED",
    "conversion.rejected": "REJECTED",
    "conversion.reversed": "REVERSED",
  };
  const decision = decisions[event.eventType];
  assert(decision, "WEBHOOK_TYPE_UNSUPPORTED", "Unsupported conversion event.", 400);
  const value = conversionPayload.parse(event.payload);
  const activity = await tx.activity.findUnique({
    where: { id: value.activityId },
    include: { campaign: true },
  });
  assert(
    activity && activity.campaignId === value.campaignId && activity.type === "CONVERSION",
    "CONVERSION_CORRELATION_FAILED",
    "The conversion does not match a conversion activity.",
    409,
  );
  const convertedAt = new Date(value.convertedAt),
    valueMinor = value.valueMinor === undefined ? null : BigInt(value.valueMinor);
  assert(
    convertedAt >= activity.campaign.startAt &&
      convertedAt < activity.campaign.endAt &&
      convertedAt.getTime() >= activity.createdAt.getTime() - 300_000 &&
      convertedAt.getTime() <= event.occurredAt.getTime() + 300_000,
    "CONVERSION_TIME_INVALID",
    "The conversion time is outside its eligible activity window.",
    409,
  );
  assert(
    !event.isDemo || activity.campaign.isDemo,
    "DEMO_PROVENANCE_MISMATCH",
    "Development evidence cannot validate a live campaign.",
    409,
  );
  const existing = await tx.providerConversion.findUnique({
    where: {
      provider_externalId: { provider: event.provider, externalId: value.externalConversionId },
    },
  });
  if (existing) {
    assert(
      existing.activityId === activity.id &&
        existing.campaignId === activity.campaignId &&
        existing.convertedAt.getTime() === convertedAt.getTime() &&
        existing.valueMinor === valueMinor &&
        existing.currency === value.currency,
      "CONVERSION_IDEMPOTENCY_CONFLICT",
      "Conversion identity was reused with different evidence.",
      409,
    );
    if (existing.decision === decision)
      return { conversion: existing, pendingIndependentReview: decision !== "VERIFIED" };
    assert(
      existing.decision === "VERIFIED",
      "CONVERSION_TERMINAL",
      "A rejected or reversed conversion cannot become valid again.",
      409,
    );
  } else {
    assert(
      decision !== "REVERSED",
      "CONVERSION_NOT_FOUND",
      "The original conversion must be received before its reversal.",
      409,
    );
    assert(
      !(await tx.providerConversion.findUnique({
        where: { provider_activityId: { provider: event.provider, activityId: activity.id } },
      })),
      "CONVERSION_IDEMPOTENCY_CONFLICT",
      "This provider already correlated a conversion to the activity.",
      409,
    );
  }
  if (decision === "VERIFIED")
    assert(
      activity.state === "PENDING_VALIDATION" || activity.state === "VALIDATED",
      "CONVERSION_TERMINAL",
      "The underlying activity is no longer eligible for validation.",
      409,
    );
  const conversion = existing
    ? await tx.providerConversion.update({
        where: { id: existing.id },
        data: { decision, latestWebhookId: event.id },
      })
    : await tx.providerConversion.create({
        data: {
          id: randomUUID(),
          provider: event.provider,
          externalId: value.externalConversionId,
          activityId: activity.id,
          campaignId: activity.campaignId,
          convertedAt,
          valueMinor,
          currency: value.currency,
          decision,
          latestWebhookId: event.id,
        },
      });
  if (decision !== "VERIFIED") {
    const beneficiaries = new Set([activity.userId]);
    if (activity.state === "VALIDATED") {
      for (const reward of await tx.rewardUnit.findMany({
        where: { activityId: activity.id },
        select: { userId: true },
      }))
        beneficiaries.add(reward.userId);
      await tx.user.updateMany({
        where: { id: { in: [...beneficiaries] } },
        data: { economicHold: true },
      });
    }
    for (const userId of beneficiaries)
      await tx.riskEvent.create({
        data: {
          userId,
          kind: "PROVIDER_CONVERSION_REVIEW",
          detail: decision + "; activity=" + activity.id + "; webhook=" + event.id,
        },
      });
  }
  await tx.auditLog.create({
    data: {
      action: "PROVIDER_CONVERSION_" + decision,
      targetId: activity.id,
      details: {
        provider: event.provider,
        conversionId: conversion.id,
        webhookId: event.id,
        automaticFinancialMutation: false,
      },
    },
  });
  return { conversion, pendingIndependentReview: true };
}
