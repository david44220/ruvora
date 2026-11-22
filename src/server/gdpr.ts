import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, jsonValue } from "./db";
import { assert } from "./errors";
import { verifyPassword, hashPassword } from "./security/password";
import { tokenDigest } from "./auth";

const anonymizeSchema = z
  .object({
    password: z.string().min(1).max(200),
    confirmation: z.literal("ANONYMIZE_MY_ACCOUNT"),
  })
  .strict();

/**
 * GDPR Article 20 Data Portability export.
 * Returns all user-owned records while excluding password hashes, TOTP secrets,
 * recovery code digests, and session bearer hashes.
 */
export async function exportUserGdprData(user: User) {
  const [
    profile,
    sessions,
    activities,
    ledgerEntries,
    promoCodes,
    questClaims,
    notifications,
    payouts,
    disputes,
    invitations,
    deliverables,
    passkeys,
    audienceSnapshots,
  ] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        handle: true,
        roles: true,
        locale: true,
        country: true,
        city: true,
        preferredLanguages: true,
        bio: true,
        category: true,
        socialLinks: true,
        customLinks: true,
        followers: true,
        audienceStatus: true,
        audienceVerifiedAt: true,
        audienceVerifiedPlatform: true,
        audienceVerifiedSource: true,
        autoMonetize: true,
        profileTheme: true,
        directoryOptIn: true,
        kycStatus: true,
        billingEntityName: true,
        vatNumber: true,
        createdAt: true,
      },
    }),
    db.session.findMany({
      where: { userId: user.id },
      select: { id: true, createdAt: true, authenticatedAt: true, expiresAt: true },
    }),
    db.activity.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        campaignId: true,
        type: true,
        state: true,
        billableMinor: true,
        abVariantId: true,
        promoCodeUsed: true,
        createdAt: true,
        validatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    db.ledgerEntry.findMany({
      where: { accountId: `user:${user.id}` },
      include: {
        transaction: { select: { id: true, kind: true, description: true, createdAt: true } },
      },
      orderBy: { transaction: { createdAt: "desc" } },
      take: 1000,
    }),
    db.promoCode.findMany({
      where: { creatorId: user.id },
      select: { code: true, campaignId: true, usesCount: true, createdAt: true },
    }),
    db.questClaim.findMany({
      where: { userId: user.id },
      select: { questCode: true, xpAwarded: true, claimedAt: true },
    }),
    db.notification.findMany({
      where: { userId: user.id },
      select: { id: true, kind: true, titleKey: true, createdAt: true, readAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.payoutRequest.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        state: true,
        destinationSummary: true,
        createdAt: true,
        settledAt: true,
      },
    }),
    db.activityDispute.findMany({
      where: { creatorId: user.id },
      select: {
        id: true,
        activityId: true,
        reason: true,
        state: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
    db.campaignInvitation.findMany({
      where: { creatorId: user.id },
      select: { id: true, campaignId: true, state: true, createdAt: true, respondedAt: true },
    }),
    db.ugcDeliverable.findMany({
      where: { creatorId: user.id },
      select: {
        id: true,
        campaignId: true,
        state: true,
        pitch: true,
        draftUrl: true,
        createdAt: true,
      },
    }),
    db.passkeyCredential.findMany({
      where: { userId: user.id },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    }),
    db.audienceVerificationSnapshot.findMany({
      where: { userId: user.id },
      orderBy: { verifiedAt: "desc" },
    }),
  ]);

  return jsonValue({
    exportedAt: new Date().toISOString(),
    schemaVersion: "ruvora-gdpr-v1",
    accountingRetentionNotice:
      "Append-only financial ledger records and audit trails are retained in pseudonymized form as required for financial integrity.",
    profile,
    sessions,
    activities,
    ledgerEntries: ledgerEntries.map((e) => ({
      transactionId: e.transaction.id,
      kind: e.transaction.kind,
      amountMinor: e.amountMinor.toString(),
      description: e.transaction.description,
      createdAt: e.transaction.createdAt.toISOString(),
    })),
    promoCodes,
    questClaims,
    notifications,
    payouts,
    disputes,
    invitations,
    deliverables,
    passkeys,
    audienceSnapshots,
  });
}

/**
 * GDPR Article 17 Erasure via PII anonymization / crypto-shredding:
 * Scrubs personal identifiers, revokes sessions/share links/passkeys/integrations,
 * and disables login while strictly preserving immutable Ledger, Distribution, and AuditLog history.
 */
export async function anonymizeUserAccount(
  user: User,
  sessionToken: string | undefined,
  input: unknown,
) {
  assert(
    !user.roles.includes("ADMIN"),
    "ADMIN_ANONYMIZATION_FORBIDDEN",
    "Administrator accounts cannot self-anonymize.",
    403,
  );
  const value = anonymizeSchema.parse(input);
  assert(
    await verifyPassword(value.password, user.passwordHash),
    "INVALID_CREDENTIALS",
    "Current password is incorrect.",
    401,
  );
  return atomic(async (tx) => {
    if (user.mfaEnabledAt) {
      assert(
        sessionToken && sessionToken.length <= 128,
        "UNAUTHENTICATED",
        "Sign in to continue.",
        401,
      );
      const session = await tx.session.findUnique({
        where: { tokenHash: tokenDigest(sessionToken) },
      });
      const cutoff = Date.now() - 15 * 60_000;
      assert(
        session &&
          session.userId === user.id &&
          session.expiresAt > new Date() &&
          session.mfaVerifiedAt &&
          session.mfaVerifiedAt.getTime() > cutoff,
        "FRESH_AUTH_REQUIRED",
        "Confirm your authenticator code before anonymizing your account.",
        403,
      );
    }
    const pendingPayout = await tx.payoutRequest.findFirst({
      where: { userId: user.id, state: { in: ["REQUESTED", "PROCESSING"] } },
    });
    assert(
      !pendingPayout,
      "PENDING_PAYOUT_EXISTS",
      "Resolve open payout requests before anonymizing your account.",
      409,
    );

    const token = randomBytes(12).toString("hex");
    const lockedPasswordHash = await hashPassword(randomBytes(32).toString("hex"));

    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.passkeyCredential.deleteMany({ where: { userId: user.id } });
    await tx.passkeyChallenge.deleteMany({ where: { userId: user.id } });
    await tx.shareLink.updateMany({ where: { ownerId: user.id }, data: { active: false } });
    await tx.promoCode.updateMany({ where: { creatorId: user.id }, data: { active: false } });
    await tx.advertiserIntegration.deleteMany({ where: { advertiserId: user.id } });
    await tx.workspaceMember.deleteMany({
      where: { OR: [{ ownerId: user.id }, { memberId: user.id }] },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        email: `anonymized-${token}@deleted.ruvora.invalid`,
        passwordHash: lockedPasswordHash,
        displayName: "Deleted User",
        handle: null,
        bio: "",
        city: null,
        country: null,
        socialLinks: [],
        customLinks: [],
        profileModules: [],
        billingEntityName: null,
        vatNumber: null,
        directoryOptIn: false,
        autoMonetize: false,
        audienceVerifyCode: null,
        suspended: true,
        anonymizedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "GDPR_ACCOUNT_ANONYMIZED",
        targetId: user.id,
        details: jsonValue({
          preservedFinancialHistory: true,
          anonymizedAt: new Date().toISOString(),
        }),
      },
    });

    return { anonymized: true };
  });
}
