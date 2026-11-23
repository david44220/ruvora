import { randomBytes, randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db } from "./db";
import { assert } from "./errors";
import { requireRole } from "./auth";
import { assertEligible } from "./profiles";
import { openSecret, sealSecret, secretDigest } from "./security/crypto";
import { assertDevelopment, isDevelopment } from "./environment";
import { signWebhook, verifyWebhookSignature, receiveWebhook, processWebhook } from "./webhooks";
import { notifyUser } from "./notifications";
import { resolveAdvertiserWorkspace } from "./workspaces";

const KEY_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

function integrationSnippets(advertiserId: string) {
  const endpoint = "/api/webhooks/conversion";
  const devEndpoint = "/api/webhooks/development-conversion";
  return {
    endpoint,
    devEndpoint,
    shopify: `// Shopify Checkout / Pixel webhook relay (Server-to-Server)
// POST ${endpoint}
// Headers:
//   x-ruvora-workspace: ${advertiserId}
//   x-ruvora-signature: t=<unix_ts>,v1=<hmac_sha256_hex>
{
  "id": "shopify_order_<ORDER_ID>",
  "type": "conversion.verified",
  "occurredAt": "<ISO_8601_TIMESTAMP>",
  "data": {
    "activityId": "<RUVORA_ACTIVITY_ID>",
    "campaignId": "<YOUR_CAMPAIGN_ID>",
    "externalConversionId": "order_<ORDER_ID>",
    "convertedAt": "<ISO_8601_TIMESTAMP>",
    "valueMinor": "4900",
    "currency": "EUR"
  }
}`,
    woocommerce: `// WooCommerce Order Completed hook (PHP / Node relay)
// POST https://<your-ruvora-domain>${endpoint}
// Header: x-ruvora-workspace: ${advertiserId}
// Header: x-ruvora-signature: t=<unix_ts>,v1=<hmac_sha256("conversion.<unix_ts>." + rawBody, RUVORA_SIGNING_KEY)>
{
  "id": "wc_order_<ORDER_ID>",
  "type": "conversion.verified",
  "occurredAt": "<ISO_8601_TIMESTAMP>",
  "data": {
    "activityId": "<RUVORA_ACTIVITY_ID>",
    "campaignId": "<YOUR_CAMPAIGN_ID>",
    "externalConversionId": "wc_<ORDER_ID>",
    "convertedAt": "<ISO_8601_TIMESTAMP>",
    "valueMinor": "3900",
    "currency": "EUR"
  }
}`,
    stripe: `// Stripe checkout.session.completed -> Ruvora conversion callback
// Header: x-ruvora-workspace: ${advertiserId}
// Sign raw JSON body with HMAC-SHA256 using your Ruvora signing key (workspace ${advertiserId.slice(0, 8)})
// Payload context: "conversion.<timestamp>.<rawBody>"`,
    zapier: `// Zapier / Make / Webflow Webhook Action
// URL: https://<your-ruvora-domain>${endpoint}
// Header: x-ruvora-workspace: ${advertiserId}
// Method: POST | Content-Type: application/json
// Pass ruvora_activity_id from your landing URL query or promo code tracking.`,
    curl: `# Generic signed HMAC-SHA256 conversion webhook test
TS=$(date +%s)
BODY='{"id":"order_1042","type":"conversion.verified","occurredAt":"2026-11-23T12:00:00Z","data":{"activityId":"<ACT_ID>","campaignId":"<CAMP_ID>","externalConversionId":"ord_1042","convertedAt":"2026-11-23T12:00:00Z","valueMinor":"2900","currency":"EUR"}}'
SIG=$(printf "conversion.%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$RUVORA_SIGNING_KEY" | awk '{print $2}')
curl -X POST "https://<your-ruvora-domain>${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "x-ruvora-workspace: ${advertiserId}" \\
  -H "x-ruvora-signature: t=$TS,v1=$SIG" \\
  -d "$BODY"`,
  };
}

/**
 * Resolves the advertiser's active signing key plus any previous key still within its 24h rotation grace window.
 */
export async function resolveAdvertiserSigningKeys(advertiserId: string): Promise<string[]> {
  const record = await db.advertiserIntegration.findUnique({
    where: { advertiserId },
    select: {
      sealedSigningKey: true,
      previousSealedSigningKey: true,
      previousKeyExpiresAt: true,
    },
  });
  if (!record) return [];
  const context = `advertiser-integration:${advertiserId}`;
  const keys: string[] = [];
  try {
    keys.push(openSecret(record.sealedSigningKey, context));
  } catch {
    // Ignore corrupted box rather than crashing webhook resolution
  }
  if (
    record.previousSealedSigningKey &&
    record.previousKeyExpiresAt &&
    record.previousKeyExpiresAt.getTime() > Date.now()
  ) {
    try {
      keys.push(openSecret(record.previousSealedSigningKey, context));
    } catch {
      // Ignore expired/corrupted previous box
    }
  }
  return keys;
}

export async function getAdvertiserIntegration(user: User, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "VIEW");
  const record = await db.advertiserIntegration.findUnique({
    where: { advertiserId: ctx.ownerId },
    select: {
      id: true,
      keyPrefix: true,
      lastRotatedAt: true,
      previousKeyExpiresAt: true,
      createdAt: true,
    },
  });
  return {
    configured: Boolean(record),
    workspaceOwnerId: ctx.ownerId,
    workspaceRole: ctx.role,
    keyPrefix: record?.keyPrefix ?? null,
    lastRotatedAt: record?.lastRotatedAt ?? null,
    graceWindowUntil:
      record?.previousKeyExpiresAt && record.previousKeyExpiresAt.getTime() > Date.now()
        ? record.previousKeyExpiresAt
        : null,
    development: isDevelopment(),
    snippets: integrationSnippets(ctx.ownerId),
  };
}

export async function rotateAdvertiserIntegrationKey(user: User, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "OWNER_ONLY");
  return atomic(async (tx) => {
    await assertEligible(tx, ctx.ownerId);
    const previous = await tx.advertiserIntegration.findUnique({
      where: { advertiserId: ctx.ownerId },
      select: { sealedSigningKey: true },
    });
    const rawKey = `ruv_whsec_${randomBytes(24).toString("hex")}`;
    const keyPrefix = rawKey.slice(0, 18);
    const sealed = sealSecret(rawKey, `advertiser-integration:${ctx.ownerId}`);
    const digest = secretDigest(rawKey);
    const now = new Date();
    const graceUntil = previous ? new Date(now.getTime() + KEY_ROTATION_GRACE_MS) : null;

    const record = await tx.advertiserIntegration.upsert({
      where: { advertiserId: ctx.ownerId },
      create: {
        advertiserId: ctx.ownerId,
        keyPrefix,
        sealedSigningKey: sealed,
        signingKeyDigest: digest,
        lastRotatedAt: now,
      },
      update: {
        keyPrefix,
        sealedSigningKey: sealed,
        signingKeyDigest: digest,
        previousSealedSigningKey: previous?.sealedSigningKey ?? null,
        previousKeyExpiresAt: graceUntil,
        lastRotatedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ADVERTISER_INTEGRATION_KEY_ROTATED",
        targetId: record.id,
        details: { keyPrefix, workspaceOwnerId: ctx.ownerId, hasGraceWindow: Boolean(graceUntil) },
      },
    });
    return {
      keyPrefix: record.keyPrefix,
      signingKey: rawKey,
      lastRotatedAt: record.lastRotatedAt,
      graceWindowUntil: graceUntil,
      shownOnce: true,
    };
  });
}

export async function listAdvertiserWebhookEvents(user: User, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "VIEW");
  const events = await db.webhookEvent.findMany({
    where: { advertiserId: ctx.ownerId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      provider: true,
      externalId: true,
      eventType: true,
      status: true,
      attempts: true,
      lastErrorCode: true,
      occurredAt: true,
      processedAt: true,
      isDemo: true,
      createdAt: true,
    },
  });
  return { events };
}

/**
 * Verifies the advertiser workspace's active AES-256-GCM sealed HMAC signing key end-to-end
 * by signing and verifying a diagnostic payload without creating any economic or ledger effects.
 */
export async function sendSignedWebhookPing(user: User, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "MANAGE_CAMPAIGNS");
  const record = await db.advertiserIntegration.findUnique({
    where: { advertiserId: ctx.ownerId },
    select: { id: true, keyPrefix: true, sealedSigningKey: true },
  });
  assert(
    record,
    "WEBHOOK_KEY_NOT_CONFIGURED",
    "Generate a workspace signing key before testing HMAC signatures.",
    409,
  );
  const startedAt = Date.now();
  const keys = await resolveAdvertiserSigningKeys(ctx.ownerId);
  assert(
    keys.length > 0,
    "WEBHOOK_KEY_NOT_CONFIGURED",
    "Workspace signing key could not be loaded.",
    500,
  );
  const activeKey = keys[0]!;
  const provider = isDevelopment() ? "development-conversion" : "conversion";
  const pingId = `ping-${randomUUID().slice(0, 12)}`;
  const rawBody = Buffer.from(
    JSON.stringify({
      id: pingId,
      type: "conversion.verified",
      occurredAt: new Date().toISOString(),
      data: { diagnostic: true, workspaceOwnerId: ctx.ownerId },
    }),
    "utf8",
  );
  const signature = signWebhook(provider, rawBody, activeKey);
  verifyWebhookSignature(provider, rawBody, signature, activeKey);
  const latencyMs = Math.max(1, Date.now() - startedAt);
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "ADVERTISER_WEBHOOK_PING_VERIFIED",
      targetId: record.id,
      details: {
        workspaceOwnerId: ctx.ownerId,
        keyPrefix: record.keyPrefix,
        provider,
        pingId,
        latencyMs,
      },
    },
  });
  return {
    ok: true,
    verified: true,
    pingId,
    provider,
    keyPrefix: record.keyPrefix,
    latencyMs,
    economicEffect: "NONE" as const,
  };
}

const devTestSchema = z
  .object({
    campaignId: z.string().min(1).max(100),
    activityId: z.string().min(1).max(100).optional(),
  })
  .strict();

/** Development-only conversion callback test exercising the real HMAC webhook inbox. */
export async function triggerDevTestConversion(user: User, input: unknown, workspaceId?: string) {
  const ctx = await resolveAdvertiserWorkspace(user, workspaceId, "MANAGE_CAMPAIGNS");
  assertDevelopment("Development conversion callback test");
  const value = devTestSchema.parse(input);
  const campaign = await db.campaign.findUnique({ where: { id: value.campaignId } });
  assert(
    campaign && campaign.advertiserId === ctx.ownerId,
    "CAMPAIGN_NOT_FOUND",
    "Campaign not found.",
    404,
  );
  assert(
    campaign.isDemo,
    "DEMO_PROVENANCE_MISMATCH",
    "Development conversion tests require a development campaign.",
    409,
  );
  const activity = value.activityId
    ? await db.activity.findUnique({ where: { id: value.activityId } })
    : await db.activity.findFirst({
        where: {
          campaignId: campaign.id,
          type: "CONVERSION",
          state: "PENDING_VALIDATION",
        },
        orderBy: { createdAt: "desc" },
      });
  assert(
    activity && activity.campaignId === campaign.id && activity.type === "CONVERSION",
    "CONVERSION_CORRELATION_FAILED",
    "No pending conversion activity found on this campaign to verify.",
    409,
  );
  const secret = process.env.DEV_WEBHOOK_SECRET ?? "";
  assert(
    Buffer.byteLength(secret) >= 32,
    "WEBHOOK_SECRET_REQUIRED",
    "DEV_WEBHOOK_SECRET must be configured in development.",
    503,
  );
  const nowIso = new Date().toISOString();
  const payload = JSON.stringify({
    id: `dev-conv-${randomUUID()}`,
    type: "conversion.verified",
    occurredAt: nowIso,
    data: {
      activityId: activity.id,
      campaignId: campaign.id,
      externalConversionId: `dev-ext-${activity.id.slice(0, 12)}`,
      convertedAt: nowIso,
      valueMinor: campaign.unitCostMinor.toString(),
      currency: "EUR",
    },
  });
  const rawBody = Buffer.from(payload, "utf8");
  const signature = signWebhook("development-conversion", rawBody, secret);
  const received = await receiveWebhook("development-conversion", rawBody, signature, ctx.ownerId);
  await processWebhook(received.eventId);
  return {
    ok: true,
    activityId: activity.id,
    webhookEventId: received.eventId,
    isDemo: true,
  };
}

export async function listWorkspaceMembers(user: User) {
  const canOwn = user.roles.includes("ADVERTISER") || user.roles.includes("ADMIN");
  const [members, memberships] = await Promise.all([
    canOwn
      ? db.workspaceMember.findMany({
          where: { ownerId: user.id },
          include: {
            member: { select: { id: true, displayName: true, email: true, handle: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    db.workspaceMember.findMany({
      where: { memberId: user.id },
      include: {
        owner: { select: { id: true, displayName: true, handle: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { members, memberships };
}

const addMemberSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
    role: z.enum(["CAMPAIGN_MANAGER", "BILLING", "VIEWER"]),
  })
  .strict();

export async function addWorkspaceMember(user: User, input: unknown) {
  requireRole(user, "ADVERTISER");
  const value = addMemberSchema.parse(input);
  return atomic(async (tx) => {
    await assertEligible(tx, user.id);
    const target = await tx.user.findUnique({ where: { email: value.email } });
    assert(
      target && !target.suspended,
      "USER_NOT_FOUND",
      "No active Ruvora user matches this email.",
      404,
    );
    assert(
      target.id !== user.id,
      "SELF_INVITE",
      "You are already the owner of this workspace.",
      400,
    );
    const membership = await tx.workspaceMember.upsert({
      where: { ownerId_memberId: { ownerId: user.id, memberId: target.id } },
      create: { ownerId: user.id, memberId: target.id, role: value.role },
      update: { role: value.role },
      include: {
        member: { select: { id: true, displayName: true, email: true, handle: true } },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "WORKSPACE_MEMBER_ADDED",
        targetId: membership.id,
        details: { memberId: target.id, role: value.role },
      },
    });
    await notifyUser(tx, {
      userId: target.id,
      kind: "WORKSPACE_INVITE",
      titleKey: "p4NotifWorkspaceInvite",
      bodyParams: { owner: user.displayName, role: value.role },
      href: "/app",
    });
    return { membership };
  });
}

const removeMemberSchema = z
  .object({
    memberId: z.string().min(1).max(100),
  })
  .strict();

export async function removeWorkspaceMember(user: User, input: unknown) {
  requireRole(user, "ADVERTISER");
  const value = removeMemberSchema.parse(input);
  return atomic(async (tx) => {
    const existing = await tx.workspaceMember.findUnique({
      where: { ownerId_memberId: { ownerId: user.id, memberId: value.memberId } },
    });
    assert(existing, "NOT_FOUND", "Team member not found.", 404);
    await tx.workspaceMember.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "WORKSPACE_MEMBER_REMOVED",
        targetId: existing.id,
        details: { memberId: value.memberId },
      },
    });
    return { removed: true };
  });
}
