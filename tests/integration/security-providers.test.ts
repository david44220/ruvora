import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { Role, User } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { atomic, db } from "../../src/server/db";
import { login, tokenDigest, userFromToken } from "../../src/server/auth";
import { hashPassword } from "../../src/server/security/password";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  recoverMfa,
  requireFreshMfa,
  revokeSessions,
  stepUp,
} from "../../src/server/security/mfa";
import { createTotpSecret, totpCode } from "../../src/server/security/totp";
import { openSecret, sealSecret, secretDigest } from "../../src/server/security/crypto";
import {
  developmentMailbox,
  processMailOutbox,
  redeemEmailVerification,
  redeemPasswordReset,
  requestEmailVerification,
  requestPasswordReset,
} from "../../src/server/security/email";
import {
  consumeApproval,
  requestApproval,
  reviewApproval,
} from "../../src/server/security/approvals";
import {
  depositAdvertiserBalance,
  refundAdvertiserDeposit,
} from "../../src/server/providers/payments";
import {
  getConversionDecision,
  hasVerifiedConversion,
} from "../../src/server/providers/conversions";
import {
  processWebhook,
  receiveWebhook,
  retryWebhook,
  signWebhook,
} from "../../src/server/webhooks";
import { balance } from "../../src/server/ledger";

if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/unsafe").pathname.endsWith("_test"))
  throw new Error(
    "Security integration requires an isolated *_test database; history is retained.",
  );
const tag = "sec" + randomUUID().replaceAll("-", "").slice(0, 9);
const password = "Security-Fixture-Only-2026!",
  reason = "Independent integration verification of supporting evidence.";
const webhookKey = "test-only-webhook-key-32-bytes-" + tag;
let sequence = 0,
  passwordHash: string;
let admin: User, reviewer: User, adminToken: string, reviewerToken: string;
const id = () => tag + "_" + ++sequence;
async function makeUser(role: Role = "USER") {
  const key = id();
  return db.user.create({
    data: {
      email: key + "@integration.test",
      displayName: key,
      passwordHash,
      handle: key,
      roles: role === "USER" ? ["USER"] : ["USER", role],
      onboarded: true,
      ageEligible: true,
      termsAcceptedAt: new Date(),
      country: "FR",
      category: "Design",
      isDemo: true,
    },
  });
}
async function signIn(user: User) {
  return (await login({ email: user.email, password })).session.token;
}
async function enroll(user: User, token: string) {
  const enrollment = await beginMfaEnrollment(user, token, { password });
  const result = await confirmMfaEnrollment(user, token, {
    enrollmentId: enrollment.enrollmentId,
    code: totpCode(enrollment.secret),
  });
  return { ...enrollment, ...result };
}
async function sendEvent(
  provider: string,
  type: string,
  data: Record<string, unknown>,
  externalId = id(),
) {
  const raw = Buffer.from(
    JSON.stringify({ id: externalId, type, occurredAt: new Date().toISOString(), data }),
  );
  return {
    raw,
    result: await receiveWebhook(provider, raw, signWebhook(provider, raw, webhookKey)),
  };
}
async function conversionFixture() {
  const advertiser = await makeUser("ADVERTISER"),
    user = await makeUser();
  const campaign = await db.campaign.create({
    data: {
      advertiserId: advertiser.id,
      name: id(),
      objective: "CONVERSION",
      destinationUrl: "https://example.com/conversion",
      budgetMinor: 10000n,
      dailyBudgetMinor: 10000n,
      unitCostMinor: 100n,
      startAt: new Date(Date.now() - 3600000),
      endAt: new Date(Date.now() + 3600000),
      isDemo: true,
    },
  });
  const activity = await db.activity.create({
    data: { idempotencyKey: id(), userId: user.id, campaignId: campaign.id, type: "CONVERSION" },
  });
  return {
    user,
    campaign,
    activity,
    payload: {
      activityId: activity.id,
      campaignId: campaign.id,
      externalConversionId: id(),
      convertedAt: new Date().toISOString(),
      valueMinor: "100",
      currency: "EUR",
    },
  };
}
beforeAll(async () => {
  vi.stubEnv("APP_ENV", "development");
  vi.stubEnv("ALLOW_DEMO_FUNDING", "true");
  vi.stubEnv("PAYMENT_PROVIDER", "development");
  vi.stubEnv("EMAIL_PROVIDER", "development");
  vi.stubEnv("DEV_WEBHOOK_SECRET", webhookKey);
  // Separate fixture key never encrypts development application records.
  vi.stubEnv("SECURITY_ENCRYPTION_KEY", Buffer.alloc(32, 83).toString("base64"));
  passwordHash = await hashPassword(password);
  admin = await makeUser("ADMIN");
  reviewer = await makeUser("ADMIN");
  adminToken = await signIn(admin);
  reviewerToken = await signIn(reviewer);
  await enroll(admin, adminToken);
  await enroll(reviewer, reviewerToken);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("durable authentication and security state", () => {
  it("binds one-use MFA enrollment to the session and stores only encrypted secrets", async () => {
    const user = await makeUser("ADMIN"),
      token = await signIn(user),
      otherToken = await signIn(user);
    const enrollment = await beginMfaEnrollment(user, token, { password });
    const input = { enrollmentId: enrollment.enrollmentId, code: totpCode(enrollment.secret) };
    await expect(confirmMfaEnrollment(user, otherToken, input)).rejects.toMatchObject({
      code: "MFA_ENROLLMENT_EXPIRED",
    });
    await confirmMfaEnrollment(user, token, input);
    const stored = await db.mfaCredential.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stored.secretCiphertext).not.toContain(enrollment.secret);
    expect(openSecret(stored.secretCiphertext, "mfa:" + user.id) === enrollment.secret).toBe(true);
    await expect(confirmMfaEnrollment(user, token, input)).rejects.toMatchObject({
      code: "MFA_ENROLLMENT_EXPIRED",
    });
    await expect(requireFreshMfa(user, token)).resolves.toHaveProperty("freshUntil");
    await expect(requireFreshMfa(user, otherToken)).rejects.toMatchObject({
      code: "FRESH_AUTH_REQUIRED",
    });
  });
  it("accepts a TOTP counter exactly once across concurrent sessions and enforces freshness", async () => {
    const user = await makeUser("ADMIN"),
      first = await signIn(user),
      second = await signIn(user),
      secret = createTotpSecret();
    await db.mfaCredential.create({
      data: { userId: user.id, secretCiphertext: sealSecret(secret, "mfa:" + user.id) },
    });
    await db.user.update({ where: { id: user.id }, data: { mfaEnabledAt: new Date() } });
    const input = { password, code: totpCode(secret) };
    const results = await Promise.allSettled([
      stepUp(user, first, input),
      stepUp(user, second, input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const accepted = results[0].status === "fulfilled" ? first : second;
    await expect(requireFreshMfa(user, accepted)).resolves.toHaveProperty("sessionId");
    await db.session.update({
      where: { tokenHash: tokenDigest(accepted) },
      data: { authenticatedAt: new Date(Date.now() - 16 * 60000) },
    });
    await expect(requireFreshMfa(user, accepted)).rejects.toMatchObject({
      code: "FRESH_AUTH_REQUIRED",
    });
    await expect(stepUp(user, first, input)).rejects.toMatchObject({ code: "INVALID_MFA_CODE" });
  });
  it("consumes recovery codes, revokes every session, and requires re-enrollment", async () => {
    const user = await makeUser("ADMIN"),
      token = await signIn(user),
      other = await signIn(user);
    const enrolled = await enroll(user, token);
    await recoverMfa(user, token, { password, recoveryCode: enrolled.recoveryCodes[0] });
    expect(await userFromToken(token)).toBeNull();
    expect(await userFromToken(other)).toBeNull();
    expect(await db.mfaRecoveryCode.count({ where: { userId: user.id, consumedAt: null } })).toBe(
      0,
    );
    expect(
      await db.mailOutbox.count({
        where: { userId: user.id, purpose: "ACCOUNT_SECURITY_CHANGED" },
      }),
    ).toBe(2);
    const freshLogin = await signIn(user);
    await expect(
      recoverMfa(user, freshLogin, { password, recoveryCode: enrolled.recoveryCodes[0] }),
    ).rejects.toMatchObject({ code: "INVALID_RECOVERY_CODE" });
    await expect(requireFreshMfa(user, freshLogin)).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });
  it("revokes only owned sessions after a password proof", async () => {
    const user = await makeUser(),
      token = await signIn(user),
      other = await signIn(user);
    await expect(
      revokeSessions(user, token, { password: "Incorrect-Password-123" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(await userFromToken(other)).not.toBeNull();
    expect((await revokeSessions(user, token, { password })).revoked).toBe(2);
    expect(await userFromToken(other)).toBeNull();
    expect(await userFromToken(token)).toBeNull();
  });
  it("queues encrypted mail and consumes verification and reset links once without cross-purpose use", async () => {
    const user = await makeUser(),
      token = await signIn(user);
    await requestEmailVerification(user);
    const mail = (await developmentMailbox(user)).messages[0];
    const verifyToken = new URLSearchParams(new URL(mail.message.variables.url).hash.slice(1)).get(
      "token",
    )!;
    const stored = await db.mailOutbox.findUniqueOrThrow({ where: { id: mail.id } });
    expect(stored.payloadCiphertext.includes(verifyToken)).toBe(false);
    await expect(redeemPasswordReset({ token: verifyToken, password })).rejects.toMatchObject({
      code: "INVALID_SECURITY_TOKEN",
    });
    const concurrent = await Promise.allSettled([
      redeemEmailVerification({ token: verifyToken }),
      redeemEmailVerification({ token: verifyToken }),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt,
    ).not.toBeNull();
    const known = await requestPasswordReset({ email: user.email });
    expect(await requestPasswordReset({ email: id() + "@unknown.test" })).toEqual(known);
    const resetMail = (await developmentMailbox(user)).messages.find(
      (item) => item.purpose === "RESET_PASSWORD",
    )!;
    const resetToken = new URLSearchParams(
      new URL(resetMail.message.variables.url).hash.slice(1),
    ).get("token")!;
    await redeemPasswordReset({ token: resetToken, password: password + "-changed" });
    expect(await userFromToken(token)).toBeNull();
    await expect(redeemPasswordReset({ token: resetToken, password })).rejects.toMatchObject({
      code: "INVALID_SECURITY_TOKEN",
    });
    await expect(login({ email: user.email, password })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(
      login({ email: user.email, password: password + "-changed" }),
    ).resolves.toHaveProperty("session");
    expect((await developmentMailbox(admin)).messages.some((item) => item.id === mail.id)).toBe(
      false,
    );
  });
  it("rejects expired security links", async () => {
    const user = await makeUser(),
      token = id() + "-expired-token-32-characters-padding";
    await db.emailSecurityToken.create({
      data: {
        digest: secretDigest(token),
        userId: user.id,
        email: user.email,
        purpose: "VERIFY_EMAIL",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(redeemEmailVerification({ token })).rejects.toMatchObject({
      code: "INVALID_SECURITY_TOKEN",
    });
  });
});

describe("independent financial approval", () => {
  it("excludes event owners and positive prize recipients from both approval roles", async () => {
    const owner = await makeUser("ADVERTISER");
    const event = await db.event.create({
      data: {
        slug: id(),
        title: "Security approval event",
        description: "Independent fixture",
        ownerId: owner.id,
        startAt: new Date(Date.now() - 7200000),
        endAt: new Date(Date.now() - 3600000),
        rules: {},
        isDemo: true,
      },
    });
    const preview = await db.eventSettlement.create({
      data: {
        eventId: event.id,
        createdById: admin.id,
        ruleVersion: "fixture-v1",
        fingerprint: id(),
        snapshot: { allocations: [{ userId: reviewer.id, amountMinor: "100" }] },
      },
    });
    const expected = {
      operation: "EVENT_SETTLEMENT" as const,
      targetId: event.id,
      ruleVersion: "fixture-v1",
      payload: { previewId: preview.id, fingerprint: preview.fingerprint },
      reason,
    };
    await expect(requestApproval(reviewer, reviewerToken, expected)).rejects.toMatchObject({
      code: "SELF_APPROVAL",
    });
    const { approval } = await requestApproval(admin, adminToken, expected);
    await expect(
      reviewApproval(reviewer, reviewerToken, approval.id, { decision: "APPROVED", reason }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL" });
    const ownerAdmin = await db.user.update({
      where: { id: owner.id },
      data: { roles: ["USER", "ADVERTISER", "ADMIN"] },
    });
    const ownerToken = await signIn(ownerAdmin);
    await enroll(ownerAdmin, ownerToken);
    await expect(requestApproval(ownerAdmin, ownerToken, expected)).rejects.toMatchObject({
      code: "SELF_APPROVAL",
    });
    await expect(
      requestApproval(admin, adminToken, {
        ...expected,
        payload: { ...expected.payload, fingerprint: "changed" },
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_PAYLOAD_MISMATCH" });
  });
  it("returns the same configuration failure for known and unknown reset accounts", async () => {
    const user = await makeUser(),
      originalKey = process.env.SECURITY_ENCRYPTION_KEY;
    vi.stubEnv("SECURITY_ENCRYPTION_KEY", "");
    try {
      await expect(requestPasswordReset({ email: user.email })).rejects.toMatchObject({
        code: "SECURITY_KEY_REQUIRED",
      });
      await expect(requestPasswordReset({ email: id() + "@unknown.test" })).rejects.toMatchObject({
        code: "SECURITY_KEY_REQUIRED",
      });
    } finally {
      vi.stubEnv("SECURITY_ENCRYPTION_KEY", originalKey);
    }
  });

  it("rejects self approval and payload changes, then consumes once with transactional rollback", async () => {
    const expected = {
      operation: "RULE_UPDATE" as const,
      targetId: id(),
      payload: { reserveBps: 1000 },
      ruleVersion: "fixture-v1",
    };
    const { approval } = await requestApproval(admin, adminToken, { ...expected, reason });
    await expect(
      reviewApproval(admin, adminToken, approval.id, { decision: "APPROVED", reason }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL" });
    await reviewApproval(reviewer, reviewerToken, approval.id, { decision: "APPROVED", reason });
    await expect(
      atomic((tx) =>
        consumeApproval(tx, admin.id, approval.id, { ...expected, ruleVersion: "fixture-v2" }),
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_PAYLOAD_MISMATCH" });
    vi.stubEnv("APP_ENV", "staging");
    try {
      await expect(
        atomic((tx) => consumeApproval(tx, admin.id, approval.id, expected)),
      ).rejects.toMatchObject({ code: "APPROVAL_ACTOR_INELIGIBLE" });
    } finally {
      vi.stubEnv("APP_ENV", "development");
    }
    await expect(
      atomic(async (tx) => {
        await consumeApproval(tx, admin.id, approval.id, expected);
        throw new Error("rollback fixture");
      }),
    ).rejects.toThrow("rollback fixture");
    expect(
      (await db.financialApproval.findUniqueOrThrow({ where: { id: approval.id } })).state,
    ).toBe("APPROVED");
    const concurrent = await Promise.allSettled([
      atomic((tx) => consumeApproval(tx, admin.id, approval.id, expected)),
      atomic((tx) => consumeApproval(tx, admin.id, approval.id, expected)),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.financialApproval.findUniqueOrThrow({ where: { id: approval.id } })).state,
    ).toBe("EXECUTED");
    await expect(
      db.financialApproval.update({
        where: { id: approval.id },
        data: { reason: "Illegal change to approved request history" },
      }),
    ).rejects.toThrow();
  });
  it("requires fresh MFA even in development and rejects expired approvals", async () => {
    const expected = {
      operation: "ACCOUNT_HOLD" as const,
      targetId: id(),
      payload: { hold: true },
      ruleVersion: "fixture-v1",
    };
    const passwordOnly = await signIn(admin);
    await expect(
      requestApproval(admin, passwordOnly, { ...expected, reason }),
    ).rejects.toMatchObject({ code: "FRESH_AUTH_REQUIRED" });
    const { approval } = await requestApproval(admin, adminToken, { ...expected, reason });
    await reviewApproval(reviewer, reviewerToken, approval.id, { decision: "APPROVED", reason });
    // Time is advanced only for this explicit expiry assertion; no persisted request is rewritten.
    const nativeDate = Date;
    vi.useFakeTimers();
    vi.setSystemTime(new nativeDate(Date.now() + 31 * 60000));
    try {
      await expect(
        atomic((tx) => consumeApproval(tx, admin.id, approval.id, expected)),
      ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("provider money and signed conversion boundaries", () => {
  it("posts one balanced development deposit under concurrent retries and never creates RU", async () => {
    for (let round = 0; round < 3; round++) {
      const user = await makeUser("ADVERTISER"),
        value = { amountMinor: "1000", idempotencyKey: id() };
      const results = await Promise.all(
        Array.from({ length: 8 }, () => depositAdvertiserBalance(user, value)),
      );
      expect(new Set(results.map((result) => result.payment.id)).size).toBe(1);
      expect(await balance(db, "advertiser:" + user.id)).toBe(1000n);
      expect(await db.rewardUnit.count({ where: { userId: user.id } })).toBe(0);
      const entries = await db.ledgerEntry.findMany({
        where: { transactionId: results[0].payment.ledgerTransactionId! },
      });
      expect(entries.reduce((sum, entry) => sum + entry.amountMinor, 0n)).toBe(0n);
      await expect(
        depositAdvertiserBalance(user, { ...value, amountMinor: "1001" }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await expect(
        db.paymentOperation.update({
          where: { id: results[0].payment.id },
          data: { amountMinor: 2000n },
        }),
      ).rejects.toThrow();
    }
  });
  it("reconciles duplicate confirmations, refunds and chargebacks without exceeding the deposit", async () => {
    const user = await makeUser("ADVERTISER");
    const { payment } = await depositAdvertiserBalance(user, {
      amountMinor: "1000",
      idempotencyKey: id(),
    });
    const confirmed = await sendEvent("development-payment", "payment.confirmed", {
      operationId: payment.id,
      externalPaymentId: payment.externalId,
      amountMinor: "1000",
      currency: "EUR",
    });
    expect((await processWebhook(confirmed.result.eventId)).status).toBe("PROCESSED");
    expect((await processWebhook(confirmed.result.eventId)).status).toBe("PROCESSED");
    expect(await db.paymentOperation.count({ where: { userId: user.id } })).toBe(1);
    const refund = { depositId: payment.id, amountMinor: "250", idempotencyKey: id(), reason };
    await refundAdvertiserDeposit(user, refund);
    await refundAdvertiserDeposit(user, refund);
    const chargeback = await sendEvent("development-payment", "payment.chargeback", {
      depositId: payment.id,
      amountMinor: "750",
      currency: "EUR",
      reason,
    });
    const repeated = await receiveWebhook(
      "development-payment",
      chargeback.raw,
      signWebhook("development-payment", chargeback.raw, webhookKey),
    );
    expect(repeated.duplicate).toBe(true);
    await Promise.all([
      processWebhook(chargeback.result.eventId),
      processWebhook(chargeback.result.eventId),
    ]);
    expect(await balance(db, "advertiser:" + user.id)).toBe(0n);
    expect(await db.paymentOperation.count({ where: { userId: user.id } })).toBe(3);
    await expect(
      refundAdvertiserDeposit(user, { ...refund, amountMinor: "1", idempotencyKey: id() }),
    ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_EXCEEDED" });
  });
  it("deduplicates signed exact bytes and records verified conversion evidence without issuing value", async () => {
    const { activity, payload } = await conversionFixture(),
      externalId = id();
    const raw = Buffer.from(
      JSON.stringify({
        id: externalId,
        type: "conversion.verified",
        occurredAt: new Date().toISOString(),
        data: payload,
      }),
    );
    const signature = signWebhook("development-conversion", raw, webhookKey);
    const results = await Promise.all([
      receiveWebhook("development-conversion", raw, signature),
      receiveWebhook("development-conversion", raw, signature),
    ]);
    expect(results[0].eventId).toBe(results[1].eventId);
    await expect(
      receiveWebhook("development-conversion", Buffer.from(raw.toString() + " "), signature),
    ).rejects.toMatchObject({ code: "INVALID_WEBHOOK_SIGNATURE" });
    const changed = Buffer.from(raw.toString().replace('"100"', '"101"'));
    await expect(
      receiveWebhook(
        "development-conversion",
        changed,
        signWebhook("development-conversion", changed, webhookKey),
      ),
    ).rejects.toMatchObject({ code: "WEBHOOK_IDEMPOTENCY_CONFLICT" });
    expect((await processWebhook(results[0].eventId)).status).toBe("PROCESSED");
    expect(await atomic((tx) => hasVerifiedConversion(tx, activity.id, activity.campaignId))).toBe(
      true,
    );
    expect(await db.rewardUnit.count({ where: { activityId: activity.id } })).toBe(0);
    expect((await db.activity.findUniqueOrThrow({ where: { id: activity.id } })).state).toBe(
      "PENDING_VALIDATION",
    );
    const audit = await db.auditLog.findFirstOrThrow({
      where: { targetId: activity.id, action: "PROVIDER_CONVERSION_VERIFIED" },
    });
    expect(audit.actorId).toBeNull();
  });
  it("records terminal provider reversal and risk evidence while leaving financial review independent", async () => {
    const { activity, payload } = await conversionFixture();
    const verified = await sendEvent("development-conversion", "conversion.verified", payload);
    await processWebhook(verified.result.eventId);
    const reversed = await sendEvent("development-conversion", "conversion.reversed", payload);
    expect((await processWebhook(reversed.result.eventId)).status).toBe("PROCESSED");
    expect(await atomic((tx) => getConversionDecision(tx, activity.id, activity.campaignId))).toBe(
      "REVERSED",
    );
    expect(
      await db.riskEvent.count({
        where: { userId: activity.userId, kind: "PROVIDER_CONVERSION_REVIEW" },
      }),
    ).toBe(1);
    expect((await db.activity.findUniqueOrThrow({ where: { id: activity.id } })).state).toBe(
      "PENDING_VALIDATION",
    );
    const invalidResurrection = await sendEvent(
      "development-conversion",
      "conversion.verified",
      payload,
    );
    expect(await processWebhook(invalidResurrection.result.eventId)).toMatchObject({
      status: "RETRY",
      errorCode: "CONVERSION_TERMINAL",
    });
  });
  it("retries failed correlation with a bounded dead letter and audited operator retry", async () => {
    const { payload } = await conversionFixture();
    const invalid = await sendEvent("development-conversion", "conversion.verified", {
      ...payload,
      campaignId: id(),
    });
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.webhookEvent.update({
        where: { id: invalid.result.eventId },
        data: { nextAttemptAt: new Date(0) },
      });
      expect(await processWebhook(invalid.result.eventId)).toMatchObject({
        status: attempt === 5 ? "DEAD_LETTER" : "RETRY",
        errorCode: "CONVERSION_CORRELATION_FAILED",
      });
    }
    expect(
      (await db.webhookEvent.findUniqueOrThrow({ where: { id: invalid.result.eventId } })).attempts,
    ).toBe(5);
    await retryWebhook(admin, adminToken, invalid.result.eventId, { reason });
    expect(
      (await db.webhookEvent.findUniqueOrThrow({ where: { id: invalid.result.eventId } })).attempts,
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: { targetId: invalid.result.eventId, action: "WEBHOOK_RETRY_REQUESTED" },
      }),
    ).toBe(1);
  });
  it("fails closed for staging development deposits and development callbacks", async () => {
    const user = await makeUser("ADVERTISER");
    vi.stubEnv("APP_ENV", "staging");
    try {
      await expect(
        depositAdvertiserBalance(user, { amountMinor: "100", idempotencyKey: id() }),
      ).rejects.toMatchObject({ code: "DEVELOPMENT_ONLY" });
      await expect(
        receiveWebhook("development-conversion", Buffer.from("{}"), undefined),
      ).rejects.toMatchObject({ code: "DEVELOPMENT_ONLY" });
      await expect(developmentMailbox(user)).rejects.toMatchObject({ code: "DEVELOPMENT_ONLY" });
    } finally {
      vi.stubEnv("APP_ENV", "development");
    }
  });
  it("uses a durable mail lease and retries without storing transport error messages", async () => {
    const user = await makeUser();
    await requestEmailVerification(user);
    const item = (await developmentMailbox(user)).messages[0];
    await db.mailOutbox.update({
      where: { id: item.id },
      data: { createdAt: new Date(1), nextAttemptAt: new Date(0) },
    });
    await processMailOutbox({
      limit: 1,
      provider: {
        name: "fixture",
        environment: "development",
        async deliver() {
          throw new Error("Transport error must not persist token or recipient details");
        },
      },
    });
    const failed = await db.mailOutbox.findUniqueOrThrow({ where: { id: item.id } });
    expect(failed).toMatchObject({
      status: "RETRY",
      attempts: 1,
      lastErrorCode: "EMAIL_DELIVERY_FAILED",
      leaseToken: null,
    });
    await db.mailOutbox.update({ where: { id: item.id }, data: { nextAttemptAt: new Date(0) } });
    await processMailOutbox({ limit: 1 });
    expect(await db.mailOutbox.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      status: "DELIVERED",
      attempts: 2,
    });
  });
});
