import { randomUUID } from "node:crypto";
import { Prisma, type User, type WebhookEvent } from "@prisma/client";
import { z } from "zod";
import { atomic, db, jsonValue, type Tx } from "./db";
import { AppError, assert } from "./errors";
import { requireRole } from "./auth";
import { assertDevelopment, isDevelopment } from "./environment";
import { secretDigest } from "./security/crypto";
import { verifyWebhookSignature } from "./security/webhook-signature";
import { requireFreshMfa } from "./security/mfa";
import { processConversionCallback } from "./providers/conversions";
import { correctDepositInTransaction } from "./providers/payments";
export { signWebhook, verifyWebhookSignature } from "./security/webhook-signature";
function providerConfiguration(provider: string) {
  const development = provider.startsWith("development-");
  assert(
    ["conversion", "payment", "development-conversion", "development-payment"].includes(provider),
    "WEBHOOK_PROVIDER_UNKNOWN",
    "Webhook provider is not configured.",
    404,
  );
  if (development) assertDevelopment("Development webhooks");
  const secret = development
    ? process.env.DEV_WEBHOOK_SECRET
    : provider === "conversion"
      ? process.env.CONVERSION_WEBHOOK_SECRET
      : process.env.PAYMENT_WEBHOOK_SECRET;
  assert(
    secret && Buffer.byteLength(secret) >= 32,
    "WEBHOOK_SECRET_REQUIRED",
    "Webhook provider secret is not configured.",
    503,
  );
  return {
    secret,
    development,
    purpose: provider.endsWith("conversion") ? "conversion" : "payment",
  };
}
const envelope = z
  .object({
    id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_.:-]+$/),
    type: z.enum([
      "conversion.verified",
      "conversion.rejected",
      "conversion.reversed",
      "payment.confirmed",
      "payment.refunded",
      "payment.chargeback",
    ]),
    occurredAt: z.iso.datetime(),
    data: z.record(z.string(), z.json()),
  })
  .strict();
export async function receiveWebhook(
  provider: string,
  rawBody: Uint8Array,
  signature: string | undefined,
) {
  const config = providerConfiguration(provider);
  verifyWebhookSignature(provider, rawBody, signature, config.secret);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    throw new AppError("INVALID_WEBHOOK_BODY", "Webhook body is not valid JSON.", 400);
  }
  const value = envelope.parse(parsed);
  assert(
    value.type.startsWith(config.purpose + "."),
    "WEBHOOK_TYPE_UNSUPPORTED",
    "The provider cannot submit this event type.",
    400,
  );
  const hash = secretDigest(Buffer.from(rawBody));
  for (let attempt = 0; ; attempt++) {
    try {
      return await atomic(async (tx) => {
        const existing = await tx.webhookEvent.findUnique({
          where: { provider_externalId: { provider, externalId: value.id } },
        });
        if (existing) {
          assert(
            existing.payloadHash === hash,
            "WEBHOOK_IDEMPOTENCY_CONFLICT",
            "Event ID was reused with a different payload.",
            409,
          );
          return { eventId: existing.id, status: existing.status, duplicate: true };
        }
        const occurredAt = new Date(value.occurredAt);
        assert(
          occurredAt.getTime() <= Date.now() + 300_000 &&
            occurredAt.getTime() >= Date.now() - 30 * 86400_000,
          "WEBHOOK_EVENT_EXPIRED",
          "New webhook events must fall within the supported reconciliation window.",
          409,
        );
        const event = await tx.webhookEvent.create({
          data: {
            id: randomUUID(),
            provider,
            externalId: value.id,
            eventType: value.type,
            payload: jsonValue(value.data),
            payloadHash: hash,
            occurredAt,
            isDemo: config.development,
          },
        });
        return { eventId: event.id, status: event.status, duplicate: false };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
}
async function processPaymentCallback(tx: Tx, event: WebhookEvent) {
  assert(
    event.isDemo && isDevelopment(),
    "PAYMENT_PROVIDER_UNAVAILABLE",
    "Live payment receipt reconciliation is not configured.",
    503,
  );
  if (event.eventType === "payment.confirmed") {
    const value = z
      .object({
        operationId: z.string(),
        externalPaymentId: z.string(),
        amountMinor: z.string().regex(/^[1-9]\d{0,11}$/),
        currency: z.literal("EUR"),
      })
      .strict()
      .parse(event.payload);
    const operation = await tx.paymentOperation.findUnique({ where: { id: value.operationId } });
    assert(
      operation &&
        operation.isDemo &&
        operation.kind === "DEPOSIT" &&
        operation.state === "CONFIRMED" &&
        operation.externalId === value.externalPaymentId &&
        operation.amountMinor === BigInt(value.amountMinor) &&
        operation.currency === value.currency,
      "PAYMENT_CORRELATION_FAILED",
      "Provider confirmation does not match the server-recorded payment.",
      409,
    );
    return { paymentId: operation.id, confirmed: true, duplicateFinancialEffect: false };
  }
  const value = z
    .object({
      depositId: z.string(),
      amountMinor: z.string().regex(/^[1-9]\d{0,11}$/),
      currency: z.literal("EUR"),
      reason: z.string().trim().min(10).max(500),
    })
    .strict()
    .parse(event.payload);
  assert(
    event.eventType === "payment.refunded" || event.eventType === "payment.chargeback",
    "WEBHOOK_TYPE_UNSUPPORTED",
    "Unsupported payment callback.",
    400,
  );
  const parent = await tx.paymentOperation.findUnique({ where: { id: value.depositId } });
  assert(parent, "PAYMENT_CORRELATION_FAILED", "Original payment is unknown.", 409);
  const payment = await correctDepositInTransaction(tx, {
    userId: parent.userId,
    depositId: parent.id,
    amountMinor: BigInt(value.amountMinor),
    currency: value.currency,
    idempotencyKey: "webhook:" + event.externalId,
    kind: event.eventType === "payment.refunded" ? "REFUND" : "CHARGEBACK",
    reason: value.reason,
    externalId: "webhook:" + event.provider + ":" + event.externalId,
    actorId: null,
  });
  return { paymentId: payment.id, development: true };
}
export async function processWebhook(eventId: string) {
  const leaseToken = randomUUID();
  const claimed = await atomic(async (tx) => {
    const event = await tx.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
    if (
      ["PROCESSED", "DEAD_LETTER"].includes(event.status) ||
      (event.status === "PROCESSING" && event.lockedUntil && event.lockedUntil > new Date()) ||
      (event.status === "RETRY" && event.nextAttemptAt > new Date())
    )
      return null;
    if (event.attempts >= 5) {
      await tx.webhookEvent.update({ where: { id: event.id }, data: { status: "DEAD_LETTER" } });
      return null;
    }
    return tx.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        leaseToken,
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
  });
  if (!claimed)
    return {
      eventId,
      status: (await db.webhookEvent.findUniqueOrThrow({ where: { id: eventId } })).status,
    };
  try {
    const result = await atomic(async (tx) => {
      const event = await tx.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
      assert(
        event.status === "PROCESSING" && event.leaseToken === leaseToken,
        "WEBHOOK_LEASE_LOST",
        "The webhook is being processed elsewhere.",
        409,
      );
      if (event.isDemo) assertDevelopment("Development webhook processing");
      const result = event.eventType.startsWith("conversion.")
        ? await processConversionCallback(tx, event)
        : await processPaymentCallback(tx, event);
      await tx.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedUntil: null,
          leaseToken: null,
          lastErrorCode: null,
        },
      });
      return result;
    });
    return { eventId, status: "PROCESSED", result };
  } catch (error) {
    const code =
      error instanceof AppError
        ? error.code
        : error instanceof z.ZodError
          ? "INVALID_WEBHOOK_PAYLOAD"
          : "WEBHOOK_PROCESSING_FAILED";
    const status = claimed.attempts >= 5 ? "DEAD_LETTER" : "RETRY";
    await db.webhookEvent.updateMany({
      where: { id: eventId, leaseToken },
      data: {
        status,
        lastErrorCode: code,
        lockedUntil: null,
        leaseToken: null,
        nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** claimed.attempts) * 1000),
      },
    });
    return { eventId, status, errorCode: code };
  }
}
export async function processWebhookInbox(limit = 20) {
  const items = await db.webhookEvent.findMany({
    where: {
      OR: [
        { status: { in: ["RECEIVED", "RETRY"] }, nextAttemptAt: { lte: new Date() } },
        { status: "PROCESSING", lockedUntil: { lt: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(limit, 100),
    select: { id: true },
  });
  const processed = [];
  for (const item of items) processed.push(await processWebhook(item.id));
  return { processed };
}
export async function listWebhookEvents(user: User) {
  requireRole(user, "ADMIN");
  return {
    webhooks: await db.webhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        provider: true,
        externalId: true,
        eventType: true,
        status: true,
        attempts: true,
        occurredAt: true,
        createdAt: true,
        processedAt: true,
        nextAttemptAt: true,
        lastErrorCode: true,
        isDemo: true,
      },
    }),
  };
}
export async function retryWebhook(
  user: User,
  token: string | undefined,
  eventId: string,
  input: unknown,
) {
  await requireFreshMfa(user, token);
  const { reason } = z
    .object({ reason: z.string().trim().min(10).max(500) })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const event = await tx.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
    assert(
      ["RETRY", "DEAD_LETTER"].includes(event.status),
      "WEBHOOK_NOT_RETRYABLE",
      "Only failed events can be retried.",
      409,
    );
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "WEBHOOK_RETRY_REQUESTED",
        targetId: event.id,
        details: { reason, priorAttempts: event.attempts, priorErrorCode: event.lastErrorCode },
      },
    });
    const updated = await tx.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "RETRY",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseToken: null,
        lockedUntil: null,
      },
    });
    return { eventId: updated.id, status: updated.status };
  });
}
