import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, jsonValue } from "./db";
import { assert } from "./errors";
import { requireRole } from "./auth";
import { account, balance, postLedger } from "./ledger";
import { sealSecret } from "./security/crypto";
import { requireFreshMfa } from "./security/mfa";
import { consumeApproval } from "./security/approvals";
import { activeRules } from "./rules";
import { isDevelopment, validateRuntimeEnvironment } from "./environment";
import { notifyUser } from "./notifications";

export const PAYOUT_MIN_MINOR = 500n; // €5.00
export const PAYOUT_DUAL_APPROVAL_THRESHOLD_MINOR = 10_000n; // €100.00

const requestPayoutSchema = z
  .object({
    amountMinor: z.coerce.bigint().min(PAYOUT_MIN_MINOR).max(5_000_000n),
    destinationLabel: z.string().trim().min(4).max(120),
    destinationAccount: z.string().trim().min(8).max(160),
    idempotencyKey: z.string().trim().min(6).max(128).optional(),
  })
  .strict();

const reviewPayoutSchema = z
  .object({
    decision: z.enum(["SETTLE", "REJECT"]),
    reason: z.string().trim().min(6).max(500),
    approvalId: z.string().trim().min(1).max(128).optional(),
    externalReference: z.string().trim().max(128).optional(),
  })
  .strict();

const kycSchema = z
  .object({
    status: z.enum(["UNVERIFIED", "PENDING", "VERIFIED"]),
    reason: z.string().trim().min(6).max(300),
  })
  .strict();

export function maskDestination(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  if (compact.length <= 6) return "••••";
  return `${compact.slice(0, 4)}••••${compact.slice(-4)}`;
}

export async function requestPayout(user: User, input: unknown) {
  validateRuntimeEnvironment();
  assert(
    !user.suspended && !user.economicHold,
    "ACCOUNT_RESTRICTED",
    "Account cannot request payouts.",
    403,
  );
  assert(
    Boolean(user.emailVerifiedAt),
    "EMAIL_VERIFICATION_REQUIRED",
    "Verify your email before requesting payouts.",
    403,
  );
  if (!isDevelopment()) {
    assert(
      user.kycStatus === "VERIFIED",
      "KYC_REQUIRED",
      "Identity verification (KYC) is required before production payouts.",
      403,
    );
  }
  const value = requestPayoutSchema.parse(input);
  const idem = value.idempotencyKey ?? `payout-req:${user.id}:${randomUUID()}`;
  const provider =
    process.env.PAYMENT_PROVIDER === "stripe" && !isDevelopment()
      ? "stripe_connect"
      : "development";

  return atomic(async (tx) => {
    const existing = await tx.payoutRequest.findUnique({ where: { idempotencyKey: idem } });
    if (existing) {
      assert(
        existing.userId === user.id && existing.amountMinor === value.amountMinor,
        "IDEMPOTENCY_CONFLICT",
        "Payout request key mismatch.",
        409,
      );
      return serializePayout(existing);
    }

    const userAcc = await account(tx, `user:${user.id}`, "USER_PAYABLE", { userId: user.id });
    const available = await balance(tx, userAcc.id);
    assert(
      available >= value.amountMinor,
      "INSUFFICIENT_FUNDS",
      "Requested payout exceeds available ledger balance.",
      409,
    );

    const payoutId = randomUUID();
    const pendingAcc = await account(tx, `payout:${payoutId}:pending`, "PAYOUT_PENDING", {
      userId: user.id,
    });

    // Phase 1: Balanced immutable reservation from USER_PAYABLE -> PAYOUT_PENDING
    const reserveTx = await postLedger(tx, {
      key: `payout-reserve:${payoutId}`,
      kind: "PAYOUT_RESERVE",
      referenceId: payoutId,
      description: `Reserve payout ${payoutId}`,
      isDemo: isDevelopment() || user.isDemo,
      entries: [
        { accountId: userAcc.id, amountMinor: -value.amountMinor },
        { accountId: pendingAcc.id, amountMinor: value.amountMinor },
      ],
    });

    const destinationSummary = `${value.destinationLabel} (${maskDestination(value.destinationAccount)})`;
    const destinationCiphertext = sealSecret(
      JSON.stringify({ label: value.destinationLabel, account: value.destinationAccount }),
      `payout:${payoutId}:${user.id}`,
    );

    const created = await tx.payoutRequest.create({
      data: {
        id: payoutId,
        userId: user.id,
        amountMinor: value.amountMinor,
        currency: "EUR",
        provider,
        state: "REQUESTED",
        destinationSummary,
        destinationCiphertext,
        idempotencyKey: idem,
        reserveTransactionId: reserveTx.id,
        isDemo: isDevelopment() || user.isDemo,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "PAYOUT_REQUESTED",
        targetId: created.id,
        details: jsonValue({
          amountMinor: value.amountMinor.toString(),
          provider,
          destinationSummary,
          isDemo: created.isDemo,
        }),
      },
    });

    await notifyUser(tx, {
      userId: user.id,
      kind: "PAYOUT_REQUESTED",
      titleKey: "p5NotifPayoutRequested",
      bodyParams: { amountEur: (Number(value.amountMinor) / 100).toFixed(2) },
      href: "/app/wallet",
    });

    return serializePayout(created);
  });
}

export async function reviewPayout(
  admin: User,
  sessionToken: string | undefined,
  payoutId: string,
  input: unknown,
) {
  requireRole(admin, "ADMIN");
  await requireFreshMfa(admin, sessionToken);
  const value = reviewPayoutSchema.parse(input);

  return atomic(async (tx) => {
    const payout = await tx.payoutRequest.findUnique({ where: { id: payoutId } });
    assert(payout, "PAYOUT_NOT_FOUND", "Payout request not found.", 404);
    assert(
      payout.state === "REQUESTED" || payout.state === "PROCESSING",
      "PAYOUT_ALREADY_FINALIZED",
      "Payout request is already finalized.",
      409,
    );
    assert(payout.userId !== admin.id, "SELF_APPROVAL", "You cannot settle your own payout.", 403);

    const { record: rule } = await activeRules(tx);
    if (
      value.decision === "SETTLE" &&
      (payout.amountMinor >= PAYOUT_DUAL_APPROVAL_THRESHOLD_MINOR || !isDevelopment())
    ) {
      assert(
        value.approvalId,
        "APPROVAL_REQUIRED",
        "Dual approval is required for payouts of €100 or more and all non-development payouts.",
        403,
      );
      await consumeApproval(tx, admin.id, value.approvalId, {
        operation: "PAYOUT_OVERRIDE",
        targetId: payout.id,
        payload: {
          payoutId: payout.id,
          amountMinor: payout.amountMinor.toString(),
          userId: payout.userId,
        },
        ruleVersion: rule.version,
      });
    }

    const pendingAcc = await account(tx, `payout:${payout.id}:pending`, "PAYOUT_PENDING", {
      userId: payout.userId,
    });

    let settleTxId: string;
    let nextState: string;
    let externalReference: string | null = value.externalReference ?? null;

    if (value.decision === "SETTLE") {
      const settledAcc = await account(tx, "payout:settled", "PAYOUT_SETTLED");
      const settledTx = await postLedger(tx, {
        key: `payout-settle:${payout.id}`,
        kind: "PAYOUT_SETTLE",
        referenceId: payout.id,
        description: `Settle payout ${payout.id}`,
        isDemo: payout.isDemo,
        entries: [
          { accountId: pendingAcc.id, amountMinor: -payout.amountMinor },
          { accountId: settledAcc.id, amountMinor: payout.amountMinor },
        ],
      });
      settleTxId = settledTx.id;
      nextState = "PAID";
      externalReference =
        externalReference ?? (payout.isDemo ? `dev_payout_${payout.id.slice(0, 12)}` : null);
    } else {
      const userAcc = await account(tx, `user:${payout.userId}`, "USER_PAYABLE", {
        userId: payout.userId,
      });
      // Phase 2 (Reject/Fail): Balanced compensating refund PAYOUT_PENDING -> USER_PAYABLE
      const refundTx = await postLedger(tx, {
        key: `payout-refund:${payout.id}`,
        kind: "PAYOUT_REFUND",
        referenceId: payout.id,
        description: `Refund rejected payout ${payout.id}`,
        isDemo: payout.isDemo,
        entries: [
          { accountId: pendingAcc.id, amountMinor: -payout.amountMinor },
          { accountId: userAcc.id, amountMinor: payout.amountMinor },
        ],
      });
      settleTxId = refundTx.id;
      nextState = "REJECTED";
    }

    const updated = await tx.payoutRequest.update({
      where: { id: payout.id },
      data: {
        state: nextState,
        settleTransactionId: settleTxId,
        approvalId: value.approvalId ?? null,
        reviewerId: admin.id,
        reviewReason: value.reason,
        externalReference,
        settledAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: value.decision === "SETTLE" ? "PAYOUT_SETTLED" : "PAYOUT_REJECTED",
        targetId: payout.id,
        details: jsonValue({
          amountMinor: payout.amountMinor.toString(),
          userId: payout.userId,
          reason: value.reason,
          externalReference,
        }),
      },
    });

    await notifyUser(tx, {
      userId: payout.userId,
      kind: value.decision === "SETTLE" ? "PAYOUT_PAID" : "PAYOUT_REJECTED",
      titleKey: value.decision === "SETTLE" ? "p5NotifPayoutPaid" : "p5NotifPayoutRejected",
      bodyParams: { amountEur: (Number(payout.amountMinor) / 100).toFixed(2) },
      href: "/app/wallet",
    });

    return serializePayout(updated);
  });
}

export async function updateUserKycStatus(
  admin: User,
  sessionToken: string | undefined,
  targetUserId: string,
  input: unknown,
) {
  requireRole(admin, "ADMIN");
  await requireFreshMfa(admin, sessionToken);
  const value = kycSchema.parse(input);
  return atomic(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: { kycStatus: value.status },
      select: { id: true, kycStatus: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "USER_KYC_UPDATED",
        targetId: targetUserId,
        details: jsonValue({ kycStatus: value.status, reason: value.reason }),
      },
    });
    return updated;
  });
}

export async function listPayoutRequests(
  user: User,
  options?: { scope?: "self" | "admin"; cursor?: string; limit?: number },
) {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const isAdminScope = options?.scope === "admin" && user.roles.includes("ADMIN");
  const rows = await db.payoutRequest.findMany({
    where: isAdminScope ? undefined : { userId: user.id },
    include: {
      user: { select: { id: true, displayName: true, handle: true, kycStatus: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((item) => ({
      ...serializePayout(item),
      user: item.user,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

function serializePayout(row: {
  id: string;
  userId: string;
  amountMinor: bigint;
  currency: string;
  provider: string;
  state: string;
  destinationSummary: string;
  reviewReason: string | null;
  externalReference: string | null;
  isDemo: boolean;
  createdAt: Date;
  settledAt: Date | null;
}) {
  return {
    id: row.id,
    userId: row.userId,
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    provider: row.provider,
    state: row.state,
    destinationSummary: row.destinationSummary,
    reviewReason: row.reviewReason,
    externalReference: row.externalReference,
    isDemo: row.isDemo,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
}
