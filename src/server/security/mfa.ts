import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, type Tx } from "../db";
import { assert } from "../errors";
import { limitRate, requireRole, tokenDigest } from "../auth";
import { assertDevelopment, isDevelopment } from "../environment";
import { openSecret, sealSecret, secretDigest } from "./crypto";
import { createTotpSecret, decodeBase32, encodeBase32, verifyTotp } from "./totp";
import { verifyPassword } from "./password";
import { queueSecurityMail } from "./email";
const passwordInput = z.object({ password: z.string().min(12).max(128) }).strict();
const FRESH_MS = 15 * 60_000;
async function liveSession(tx: Tx, user: User, token?: string) {
  assert(token && token.length <= 128, "UNAUTHENTICATED", "Sign in to continue.", 401);
  const session = await tx.session.findUnique({
    where: { tokenHash: tokenDigest(token) },
    include: { user: true },
  });
  assert(
    session &&
      session.userId === user.id &&
      session.expiresAt > new Date() &&
      !session.user.suspended &&
      (isDevelopment() || !session.user.isDemo),
    "UNAUTHENTICATED",
    "Sign in to continue.",
    401,
  );
  return session;
}
async function checkPassword(userId: string, password: string) {
  const current = await db.user.findUniqueOrThrow({ where: { id: userId } });
  assert(
    await verifyPassword(password, current.passwordHash),
    "INVALID_CREDENTIALS",
    "Password verification failed.",
    401,
  );
  return current.passwordHash;
}
export async function beginMfaEnrollment(user: User, token: string | undefined, input: unknown) {
  const value = passwordInput.parse(input);
  await limitRate("mfa-enroll", user.id, 6);
  const passwordHash = await checkPassword(user.id, value.password);
  const secret = createTotpSecret(),
    id = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  return atomic(async (tx) => {
    const session = await liveSession(tx, user, token);
    assert(
      session.user.passwordHash === passwordHash,
      "INVALID_CREDENTIALS",
      "Credentials changed. Sign in again.",
      401,
    );
    const active = await tx.mfaCredential.findUnique({ where: { userId: user.id } });
    assert(
      !active || active.disabledAt,
      "MFA_ALREADY_ENABLED",
      "An authenticator is already enrolled.",
      409,
    );
    await tx.mfaEnrollment.upsert({
      where: { userId: user.id },
      create: {
        id,
        userId: user.id,
        sessionId: session.id,
        secretCiphertext: sealSecret(secret, "enrollment:" + id),
        expiresAt,
      },
      update: {
        id,
        sessionId: session.id,
        secretCiphertext: sealSecret(secret, "enrollment:" + id),
        expiresAt,
        consumedAt: null,
        createdAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "MFA_ENROLLMENT_STARTED", targetId: user.id, details: {} },
    });
    return {
      enrollmentId: id,
      secret,
      expiresAt,
      otpauthUrl:
        "otpauth://totp/" +
        encodeURIComponent("Ruvora:" + user.email) +
        "?secret=" +
        secret +
        "&issuer=Ruvora&algorithm=SHA1&digits=6&period=30",
    };
  });
}
export async function confirmMfaEnrollment(user: User, token: string | undefined, input: unknown) {
  const value = z
    .object({ enrollmentId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) })
    .strict()
    .parse(input);
  await limitRate("mfa-confirm", user.id, 10);
  return atomic(async (tx) => {
    const session = await liveSession(tx, user, token);
    const enrollment = await tx.mfaEnrollment.findUnique({ where: { id: value.enrollmentId } });
    assert(
      enrollment &&
        enrollment.userId === user.id &&
        enrollment.sessionId === session.id &&
        !enrollment.consumedAt &&
        enrollment.expiresAt > new Date(),
      "MFA_ENROLLMENT_EXPIRED",
      "Start a new authenticator enrollment.",
      409,
    );
    const prior = await tx.mfaCredential.findUnique({ where: { userId: user.id } });
    assert(
      !prior || prior.disabledAt,
      "MFA_ALREADY_ENABLED",
      "An authenticator is already enrolled.",
      409,
    );
    const secret = openSecret(enrollment.secretCiphertext, "enrollment:" + enrollment.id);
    const counter = verifyTotp(secret, value.code, -1n);
    const now = new Date(),
      recoveryCodes = Array.from({ length: 10 }, () => randomBytes(15).toString("base64url"));
    await tx.mfaCredential.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        secretCiphertext: sealSecret(secret, "mfa:" + user.id),
        lastAcceptedCounter: counter,
      },
      update: {
        secretCiphertext: sealSecret(secret, "mfa:" + user.id),
        lastAcceptedCounter: counter,
        enabledAt: now,
        disabledAt: null,
      },
    });
    await tx.mfaEnrollment.update({ where: { id: enrollment.id }, data: { consumedAt: now } });
    await tx.mfaRecoveryCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        digest: secretDigest("recovery:" + user.id + ":" + code),
        userId: user.id,
      })),
    });
    await tx.user.update({ where: { id: user.id }, data: { mfaEnabledAt: now } });
    await tx.session.updateMany({ where: { userId: user.id }, data: { mfaVerifiedAt: null } });
    await tx.session.update({
      where: { id: session.id },
      data: { authenticatedAt: enrollment.createdAt, mfaVerifiedAt: now },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "MFA_ENABLED", targetId: user.id, details: {} },
    });
    await queueSecurityMail(tx, session.user, "ACCOUNT_SECURITY_CHANGED", {
      action: "MFA_ENABLED",
    });
    return { ok: true, recoveryCodes };
  });
}
export async function stepUp(user: User, token: string | undefined, input: unknown) {
  const value = z
    .object({ password: z.string().min(12).max(128), code: z.string().regex(/^\d{6}$/) })
    .strict()
    .parse(input);
  await limitRate("mfa-step-up", user.id, 10, 300);
  const passwordHash = await checkPassword(user.id, value.password);
  return atomic(async (tx) => {
    const session = await liveSession(tx, user, token);
    assert(
      session.user.passwordHash === passwordHash,
      "INVALID_CREDENTIALS",
      "Credentials changed. Sign in again.",
      401,
    );
    const credential = await tx.mfaCredential.findUnique({ where: { userId: user.id } });
    assert(
      credential && !credential.disabledAt && session.user.mfaEnabledAt,
      "MFA_REQUIRED",
      "Enroll an authenticator before this action.",
      403,
    );
    const counter = verifyTotp(
      openSecret(credential.secretCiphertext, "mfa:" + user.id),
      value.code,
      credential.lastAcceptedCounter,
    );
    await tx.mfaCredential.update({
      where: { userId: user.id },
      data: { lastAcceptedCounter: counter },
    });
    const now = new Date();
    await tx.session.update({
      where: { id: session.id },
      data: { authenticatedAt: now, mfaVerifiedAt: now },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "SESSION_MFA_VERIFIED", targetId: session.id, details: {} },
    });
    return { ok: true, freshUntil: new Date(now.getTime() + FRESH_MS) };
  });
}
export async function requireFreshMfa(user: User, token?: string) {
  requireRole(user, "ADMIN");
  return atomic(async (tx) => {
    const session = await liveSession(tx, user, token);
    requireRole(session.user, "ADMIN");
    const credential = await tx.mfaCredential.findUnique({ where: { userId: user.id } });
    assert(
      credential && !credential.disabledAt && session.user.mfaEnabledAt,
      "MFA_REQUIRED",
      "Enroll an authenticator before this action.",
      403,
    );
    const cutoff = Date.now() - FRESH_MS;
    assert(
      session.mfaVerifiedAt &&
        session.mfaVerifiedAt.getTime() > cutoff &&
        session.authenticatedAt.getTime() > cutoff,
      "FRESH_AUTH_REQUIRED",
      "Confirm your password and authenticator code before this action.",
      403,
    );
    return {
      sessionId: session.id,
      freshUntil: new Date(
        Math.min(session.authenticatedAt.getTime(), session.mfaVerifiedAt.getTime()) + FRESH_MS,
      ),
    };
  });
}
export async function recoverMfa(user: User, token: string | undefined, input: unknown) {
  const value = z
    .object({ password: z.string().min(12).max(128), recoveryCode: z.string().min(16).max(128) })
    .strict()
    .parse(input);
  await limitRate("mfa-recovery", user.id, 5, 900);
  const passwordHash = await checkPassword(user.id, value.password);
  return atomic(async (tx) => {
    const session = await liveSession(tx, user, token);
    assert(
      session.user.passwordHash === passwordHash,
      "INVALID_CREDENTIALS",
      "Credentials changed.",
      401,
    );
    const recovery = await tx.mfaRecoveryCode.findUnique({
      where: { digest: secretDigest("recovery:" + user.id + ":" + value.recoveryCode) },
    });
    assert(
      recovery && recovery.userId === user.id && !recovery.consumedAt,
      "INVALID_RECOVERY_CODE",
      "Recovery code is invalid or used.",
      401,
    );
    const now = new Date();
    await tx.mfaRecoveryCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.mfaCredential.update({ where: { userId: user.id }, data: { disabledAt: now } });
    await tx.user.update({ where: { id: user.id }, data: { mfaEnabledAt: null } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "MFA_RECOVERED_SESSIONS_REVOKED",
        targetId: user.id,
        details: {},
      },
    });
    await queueSecurityMail(tx, session.user, "ACCOUNT_SECURITY_CHANGED", {
      action: "MFA_RECOVERED_SESSIONS_REVOKED",
    });
    return { ok: true, signInRequired: true };
  });
}
export async function securityStatus(user: User, token?: string) {
  return atomic(async (tx) => {
    const session = await liveSession(tx, user, token);
    const sessions = await tx.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        authenticatedAt: true,
        mfaVerifiedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      development: isDevelopment(),
      emailVerified: Boolean(session.user.emailVerifiedAt),
      mfaEnabled: Boolean(session.user.mfaEnabledAt),
      currentSessionId: session.id,
      freshUntil: session.mfaVerifiedAt
        ? new Date(
            Math.min(session.authenticatedAt.getTime(), session.mfaVerifiedAt.getTime()) + FRESH_MS,
          )
        : null,
      recoveryCodesRemaining: await tx.mfaRecoveryCode.count({
        where: { userId: user.id, consumedAt: null },
      }),
      sessions,
    };
  });
}
export async function revokeSessions(user: User, token: string | undefined, input: unknown) {
  const value = z
    .object({ password: z.string().min(12).max(128), sessionId: z.string().optional() })
    .strict()
    .parse(input);
  await limitRate("session-revoke", user.id, 10);
  const hash = await checkPassword(user.id, value.password);
  return atomic(async (tx) => {
    const current = await liveSession(tx, user, token);
    assert(current.user.passwordHash === hash, "INVALID_CREDENTIALS", "Credentials changed.", 401);
    const result = await tx.session.deleteMany({
      where: {
        userId: user.id,
        ...(value.sessionId ? { id: value.sessionId } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SESSIONS_REVOKED",
        targetId: user.id,
        details: { count: result.count },
      },
    });
    return { ok: true, revoked: result.count };
  });
}
export function developmentTotpSecret(userId: string): string {
  assertDevelopment("Seeded authenticators");
  assert(
    process.env.ALLOW_DEV_SEED === "true" && process.env.DEMO_TOTP_SECRET,
    "DEV_SEED_DISABLED",
    "Explicit development authenticator configuration is required.",
    403,
  );
  return encodeBase32(
    createHmac("sha256", decodeBase32(process.env.DEMO_TOTP_SECRET))
      .update("ruvora-admin:" + userId)
      .digest()
      .subarray(0, 20),
  );
}
export async function seedDevelopmentMfa(userId: string) {
  const secret = developmentTotpSecret(userId);
  return atomic(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    assert(
      user.isDemo && user.roles.includes("ADMIN"),
      "DEV_SEED_DISABLED",
      "Only explicit demo administrators may use seeded authenticators.",
      403,
    );
    const existing = await tx.mfaCredential.findUnique({ where: { userId } });
    if (existing) {
      assert(
        !existing.disabledAt && openSecret(existing.secretCiphertext, "mfa:" + userId) === secret,
        "MFA_SEED_CONFLICT",
        "Existing authenticator enrollment must not be overwritten.",
        409,
      );
      return { ok: true };
    }
    await tx.mfaCredential.create({
      data: { userId, secretCiphertext: sealSecret(secret, "mfa:" + userId) },
    });
    await tx.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "DEVELOPMENT_MFA_SEEDED",
        targetId: userId,
        details: { isDemo: true },
      },
    });
    return { ok: true };
  });
}
