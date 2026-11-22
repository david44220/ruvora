import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db } from "./db";
import { assert } from "./errors";
import { requireRole } from "./auth";
import { assertEligible } from "./profiles";
import { canCreatorPromote } from "./campaign-eligibility";
import { getCreatorReliability } from "./risk";

export function formatPromoCode(handle: string, suffixHex: string): string {
  const cleanHandle = handle
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  const prefix = cleanHandle || "RUVORA";
  const suffix = suffixHex
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  return `${prefix}-${suffix || "0001"}`;
}

const createPromoSchema = z
  .object({
    campaignId: z.string().min(1).max(100),
    discountLabel: z.string().trim().max(40).default(""),
  })
  .strict();

export async function createPromoCode(user: User, input: unknown) {
  requireRole(user, "CREATOR");
  const value = createPromoSchema.parse(input);
  return atomic(async (tx) => {
    const freshUser = await assertEligible(tx, user.id);
    assert(
      Boolean(freshUser.handle),
      "CREATOR_INELIGIBLE",
      "Set a public handle before generating a personal promo code.",
      400,
    );
    const campaign = await tx.campaign.findUnique({ where: { id: value.campaignId } });
    const now = new Date();
    assert(
      campaign && campaign.state === "ACTIVE" && campaign.endAt > now,
      "CAMPAIGN_INACTIVE",
      "Promo codes can only be created for active campaigns.",
      409,
    );
    assert(
      campaign.advertiserId !== user.id,
      "SELF_ATTRIBUTION",
      "Advertisers cannot generate creator promo codes on their own campaign.",
      403,
    );
    const reliability = await getCreatorReliability(tx, freshUser);
    assert(
      canCreatorPromote(freshUser, campaign, reliability.reliabilityScore),
      "CREATOR_CAMPAIGN_INELIGIBLE",
      "Your profile does not match this campaign's creator targeting criteria.",
      403,
    );
    const existing = await tx.promoCode.findUnique({
      where: { creatorId_campaignId: { creatorId: user.id, campaignId: campaign.id } },
    });
    if (existing) {
      return { promoCode: existing, created: false };
    }

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = formatPromoCode(freshUser.handle!, randomBytes(2).toString("hex"));
      const conflict = await tx.promoCode.findUnique({ where: { code: candidate } });
      if (!conflict) {
        code = candidate;
        break;
      }
    }
    assert(code.length > 0, "CONFLICT", "Could not allocate a unique promo code.", 409);

    const promoCode = await tx.promoCode.create({
      data: {
        code,
        creatorId: user.id,
        campaignId: campaign.id,
        discountLabel: value.discountLabel,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "PROMO_CODE_CREATED",
        targetId: promoCode.id,
        details: { code: promoCode.code, campaignId: campaign.id },
      },
    });
    return { promoCode, created: true };
  });
}

export async function listCreatorPromoCodes(user: User) {
  requireRole(user, "CREATOR");
  const promoCodes = await db.promoCode.findMany({
    where: { creatorId: user.id, active: true },
    include: {
      campaign: {
        select: { id: true, name: true, objective: true, destinationUrl: true, state: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { promoCodes };
}
