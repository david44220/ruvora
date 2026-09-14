import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, type Tx } from "../db";
import { AppError, assert } from "../errors";
import { limitRate } from "../auth";
import { assertDevelopment, isDevelopment } from "../environment";
import { configuredEmailProvider, type EmailMessage, type EmailProvider } from "../providers/email";
import { hashPassword } from "./password";
import { openSecret, randomToken, sealSecret, secretDigest, validateEncryptionKey } from "./crypto";
function appUrl(path: string, token?: string) {
  const origin = new URL(process.env.APP_URL ?? "http://localhost:3000");
  assert(
    !origin.username && !origin.password && (isDevelopment() || origin.protocol === "https:"),
    "UNSAFE_ENVIRONMENT",
    "Configure a safe application origin.",
    503,
  );
  const url = new URL(path, origin);
  // Tokens stay in the fragment, avoiding proxy/referrer/request logs.
  if (token) url.hash = "token=" + encodeURIComponent(token);
  return url.toString();
}
export async function queueSecurityMail(
  tx: Tx,
  user: Pick<User, "id" | "email" | "locale">,
  purpose: string,
  variables: Record<string, string>,
) {
  const id = randomUUID();
  const message: EmailMessage = {
    to: user.email,
    locale: user.locale,
    template: purpose,
    variables,
  };
  await tx.mailOutbox.create({
    data: {
      id,
      userId: user.id,
      purpose,
      payloadCiphertext: sealSecret(JSON.stringify(message), "mail:" + id),
    },
  });
  return id;
}
async function issueToken(tx: Tx, user: User, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const now = new Date(),
    token = randomToken();
  await tx.emailSecurityToken.updateMany({
    where: { userId: user.id, purpose, consumedAt: null },
    data: { consumedAt: now },
  });
  await tx.emailSecurityToken.create({
    data: {
      digest: secretDigest(token),
      userId: user.id,
      purpose,
      email: user.email,
      expiresAt: new Date(now.getTime() + (purpose === "VERIFY_EMAIL" ? 86400_000 : 30 * 60_000)),
    },
  });
  await queueSecurityMail(tx, user, purpose, {
    url: appUrl(purpose === "VERIFY_EMAIL" ? "/verify-email" : "/reset-password", token),
  });
  await tx.auditLog.create({
    data: { actorId: user.id, action: purpose + "_REQUESTED", targetId: user.id, details: {} },
  });
}
export async function requestEmailVerification(user: User) {
  await limitRate("email-verify-request", user.id, 5, 3600);
  await atomic(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(
      !current.suspended && (isDevelopment() || !current.isDemo),
      "FORBIDDEN",
      "This account is unavailable.",
      403,
    );
    if (!current.emailVerifiedAt) await issueToken(tx, current, "VERIFY_EMAIL");
  });
  return { accepted: true, delivery: "queued", development: isDevelopment() };
}
export async function requestPasswordReset(input: unknown) {
  const { email } = z
    .object({
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase().trim()),
    })
    .strict()
    .parse(input);
  await limitRate("password-reset-request", email, 5, 3600);
  // Configuration failures must have the same response for known and unknown accounts.
  validateEncryptionKey();
  appUrl("/reset-password");
  await atomic(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    if (user && !user.suspended && (isDevelopment() || !user.isDemo))
      await issueToken(tx, user, "RESET_PASSWORD");
  });
  return { accepted: true };
}
export async function redeemEmailVerification(input: unknown) {
  const { token } = z
    .object({ token: z.string().min(32).max(128) })
    .strict()
    .parse(input);
  await limitRate("email-verify-redeem", secretDigest(token), 10);
  return atomic(async (tx) => {
    const record = await tx.emailSecurityToken.findUnique({
      where: { digest: secretDigest(token) },
    });
    assert(
      record &&
        record.purpose === "VERIFY_EMAIL" &&
        !record.consumedAt &&
        record.expiresAt > new Date(),
      "INVALID_SECURITY_TOKEN",
      "The link is invalid, expired or already used.",
      400,
    );
    const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
    assert(
      user.email === record.email && !user.suspended && (isDevelopment() || !user.isDemo),
      "INVALID_SECURITY_TOKEN",
      "The link is invalid, expired or already used.",
      400,
    );
    const now = new Date();
    await tx.emailSecurityToken.update({
      where: { digest: record.digest },
      data: { consumedAt: now },
    });
    await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "EMAIL_VERIFIED",
        targetId: user.id,
        details: { development: isDevelopment() },
      },
    });
    return { ok: true };
  });
}
export async function redeemPasswordReset(input: unknown) {
  const value = z
    .object({ token: z.string().min(32).max(128), password: z.string().min(12).max(128) })
    .strict()
    .parse(input);
  await limitRate("password-reset-redeem", secretDigest(value.token), 10);
  const passwordHash = await hashPassword(value.password);
  return atomic(async (tx) => {
    const record = await tx.emailSecurityToken.findUnique({
      where: { digest: secretDigest(value.token) },
    });
    assert(
      record &&
        record.purpose === "RESET_PASSWORD" &&
        !record.consumedAt &&
        record.expiresAt > new Date(),
      "INVALID_SECURITY_TOKEN",
      "The link is invalid, expired or already used.",
      400,
    );
    const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
    assert(
      user.email === record.email && !user.suspended && (isDevelopment() || !user.isDemo),
      "INVALID_SECURITY_TOKEN",
      "The link is invalid, expired or already used.",
      400,
    );
    const now = new Date();
    await tx.emailSecurityToken.updateMany({
      where: { userId: user.id, purpose: "RESET_PASSWORD", consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await queueSecurityMail(tx, user, "PASSWORD_CHANGED", { url: appUrl("/login") });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "PASSWORD_RESET_SESSIONS_REVOKED",
        targetId: user.id,
        details: {},
      },
    });
    return { ok: true, signInRequired: true };
  });
}
export async function developmentMailbox(user: User) {
  assertDevelopment("Development mailbox");
  assert(
    process.env.EMAIL_PROVIDER === "development",
    "EMAIL_PROVIDER_UNAVAILABLE",
    "The development email adapter is not enabled.",
    403,
  );
  const items = await db.mailOutbox.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return {
    development: true,
    externalDelivery: false,
    messages: items.map((item) => ({
      id: item.id,
      purpose: item.purpose,
      status: item.status,
      createdAt: item.createdAt,
      message: JSON.parse(openSecret(item.payloadCiphertext, "mail:" + item.id)) as EmailMessage,
    })),
  };
}
export async function processMailOutbox(
  options: { limit?: number; provider?: EmailProvider } = {},
) {
  const candidates = await db.mailOutbox.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: new Date() } },
        { status: "PROCESSING", lockedUntil: { lt: new Date() } },
      ],
    },
    take: Math.min(options.limit ?? 20, 100),
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const results: { id: string; status: string }[] = [];
  for (const candidate of candidates) {
    const leaseToken = randomUUID();
    const claimed = await atomic(async (tx) => {
      const item = await tx.mailOutbox.findUniqueOrThrow({ where: { id: candidate.id } });
      if (
        ["DELIVERED", "DEAD_LETTER"].includes(item.status) ||
        (item.status === "PROCESSING" && item.lockedUntil && item.lockedUntil > new Date())
      )
        return null;
      if (["PENDING", "RETRY"].includes(item.status) && item.nextAttemptAt > new Date())
        return null;
      if (item.attempts >= 5) {
        await tx.mailOutbox.update({ where: { id: item.id }, data: { status: "DEAD_LETTER" } });
        return null;
      }
      return tx.mailOutbox.update({
        where: { id: item.id },
        data: {
          status: "PROCESSING",
          attempts: { increment: 1 },
          leaseToken,
          lockedUntil: new Date(Date.now() + 60_000),
        },
      });
    });
    if (!claimed) continue;
    try {
      const provider = options.provider ?? configuredEmailProvider();
      if (provider.environment === "development") assertDevelopment("Development email");
      const result = await provider.deliver(
        JSON.parse(openSecret(claimed.payloadCiphertext, "mail:" + claimed.id)) as EmailMessage,
        claimed.id,
      );
      assert(
        isDevelopment() || !result.simulated,
        "EMAIL_PROVIDER_UNAVAILABLE",
        "Simulated delivery is forbidden outside development.",
        503,
      );
      await db.mailOutbox.updateMany({
        where: { id: claimed.id, leaseToken },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          providerReference: result.reference,
          lockedUntil: null,
          leaseToken: null,
          lastErrorCode: null,
        },
      });
      results.push({ id: claimed.id, status: "DELIVERED" });
    } catch (error) {
      const code = error instanceof AppError ? error.code : "EMAIL_DELIVERY_FAILED";
      const status = claimed.attempts >= 5 ? "DEAD_LETTER" : "RETRY";
      await db.mailOutbox.updateMany({
        where: { id: claimed.id, leaseToken },
        data: {
          status,
          lockedUntil: null,
          leaseToken: null,
          lastErrorCode: code,
          nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** claimed.attempts) * 1000),
        },
      });
      results.push({ id: claimed.id, status });
    }
  }
  return { processed: results };
}
