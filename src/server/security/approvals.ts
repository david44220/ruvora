import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { atomic, db, jsonValue, type Tx } from "../db";
import { assert } from "../errors";
import { requireRole } from "../auth";
import { isDevelopment } from "../environment";
import { canonicalPayload } from "../../domains/economy/shared";
import { requireFreshMfa } from "./mfa";
import { secretDigest } from "./crypto";
export const approvalOperations = [
  "DISTRIBUTION_FINALIZE",
  "EVENT_SETTLEMENT",
  "RULE_UPDATE",
  "FINANCIAL_REVERSAL",
  "ACCOUNT_HOLD",
  "MANUAL_LEDGER",
  "PAYOUT_OVERRIDE",
] as const;
export type ApprovalOperation = (typeof approvalOperations)[number];
export type ApprovalExpectation = {
  operation: ApprovalOperation;
  targetId: string;
  payload: unknown;
  ruleVersion: string;
};
export function approvalPayloadHash(value: ApprovalExpectation) {
  return secretDigest(
    canonicalPayload(
      jsonValue({
        operation: value.operation,
        targetId: value.targetId,
        payload: value.payload,
        ruleVersion: value.ruleVersion,
      }),
    ),
  );
}
async function assertIndependent(
  tx: Tx,
  userId: string,
  operation: string,
  targetId: string,
  payload: unknown,
) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  assert(
    user.roles.includes("ADMIN") &&
      !user.suspended &&
      !user.economicHold &&
      (isDevelopment() || !user.isDemo),
    "APPROVAL_ACTOR_INELIGIBLE",
    "An active independent administrator is required.",
    403,
  );
  if (operation === "EVENT_SETTLEMENT") {
    const event = await tx.event.findUniqueOrThrow({ where: { id: targetId } });
    assert(
      ![event.ownerId, event.sponsorId, event.hostId].includes(userId),
      "SELF_APPROVAL",
      "An event beneficiary cannot authorize its settlement.",
      403,
    );
    const input = z
      .object({ previewId: z.string(), fingerprint: z.string() })
      .strict()
      .parse(payload);
    const preview = await tx.eventSettlement.findUnique({ where: { id: input.previewId } });
    assert(
      preview &&
        preview.eventId === event.id &&
        preview.fingerprint === input.fingerprint &&
        preview.state === "PREVIEW",
      "APPROVAL_PAYLOAD_MISMATCH",
      "Settlement preview is unavailable or changed.",
      409,
    );
    const snapshot = preview.snapshot as {
      allocations?: { userId: string; amountMinor: string }[];
    };
    assert(
      !snapshot.allocations?.some(
        (item) => item.userId === userId && BigInt(item.amountMinor) > 0n,
      ),
      "SELF_APPROVAL",
      "A prize recipient cannot authorize their settlement.",
      403,
    );
  }
}
export async function requestApproval(user: User, token: string | undefined, input: unknown) {
  await requireFreshMfa(user, token);
  const value = z
    .object({
      operation: z.enum(approvalOperations),
      targetId: z.string().min(1).max(128),
      payload: z.record(z.string(), z.json()),
      ruleVersion: z.string().min(1).max(128),
      reason: z.string().trim().min(10).max(500),
    })
    .strict()
    .parse(input);
  const normalized = jsonValue(value.payload);
  assert(
    Buffer.byteLength(JSON.stringify(normalized)) <= 32_768,
    "BODY_TOO_LARGE",
    "Approval payload is too large.",
    413,
  );
  return atomic(async (tx) => {
    await assertIndependent(tx, user.id, value.operation, value.targetId, value.payload);
    const approval = await tx.financialApproval.create({
      data: {
        id: randomUUID(),
        requesterId: user.id,
        operation: value.operation,
        targetId: value.targetId,
        payload: normalized,
        payloadHash: approvalPayloadHash(value),
        ruleVersion: value.ruleVersion,
        reason: value.reason,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "FINANCIAL_APPROVAL_REQUESTED",
        targetId: approval.id,
        details: {
          operation: value.operation,
          targetId: value.targetId,
          payloadHash: approval.payloadHash,
          ruleVersion: value.ruleVersion,
        },
      },
    });
    return { approval };
  });
}
export async function reviewApproval(
  user: User,
  token: string | undefined,
  approvalId: string,
  input: unknown,
) {
  await requireFreshMfa(user, token);
  const value = z
    .object({
      decision: z.enum(["APPROVED", "REJECTED"]),
      reason: z.string().trim().min(10).max(500),
    })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const approval = await tx.financialApproval.findUniqueOrThrow({ where: { id: approvalId } });
    assert(
      approval.requesterId !== user.id,
      "SELF_APPROVAL",
      "The requester cannot approve their own operation.",
      403,
    );
    assert(
      approval.state === "REQUESTED" && approval.expiresAt > new Date(),
      "APPROVAL_EXPIRED",
      "This approval is no longer available.",
      409,
    );
    await assertIndependent(tx, user.id, approval.operation, approval.targetId, approval.payload);
    await assertIndependent(
      tx,
      approval.requesterId,
      approval.operation,
      approval.targetId,
      approval.payload,
    );
    const reviewed = await tx.financialApproval.update({
      where: { id: approval.id },
      data: {
        state: value.decision,
        approverId: user.id,
        reviewReason: value.reason,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "FINANCIAL_APPROVAL_" + value.decision,
        targetId: approval.id,
        details: { reason: value.reason, payloadHash: approval.payloadHash },
      },
    });
    return { approval: reviewed };
  });
}
/** Call inside the same transaction as the financial write; rollback restores approval. */
export async function consumeApproval(
  tx: Tx,
  actorId: string,
  approvalId: string,
  expected: ApprovalExpectation,
) {
  const approval = await tx.financialApproval.findUnique({ where: { id: approvalId } });
  assert(
    approval &&
      approval.state === "APPROVED" &&
      approval.approverId &&
      approval.expiresAt > new Date(),
    "APPROVAL_REQUIRED",
    "A current independent approval is required.",
    403,
  );
  assert(
    approval.requesterId === actorId && approval.approverId !== actorId,
    "SELF_APPROVAL",
    "Only the requester may execute a separately approved action.",
    403,
  );
  assert(
    approval.operation === expected.operation &&
      approval.targetId === expected.targetId &&
      approval.ruleVersion === expected.ruleVersion &&
      approval.payloadHash === approvalPayloadHash(expected),
    "APPROVAL_PAYLOAD_MISMATCH",
    "The action changed after approval. Request a new approval.",
    409,
  );
  await assertIndependent(tx, actorId, approval.operation, approval.targetId, approval.payload);
  await assertIndependent(
    tx,
    approval.approverId,
    approval.operation,
    approval.targetId,
    approval.payload,
  );
  const executed = await tx.financialApproval.update({
    where: { id: approval.id },
    data: { state: "EXECUTED", executedAt: new Date() },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      action: "FINANCIAL_APPROVAL_EXECUTED",
      targetId: approval.id,
      details: {
        operation: approval.operation,
        targetId: approval.targetId,
        payloadHash: approval.payloadHash,
      },
    },
  });
  return executed;
}
export async function listApprovals(user: User) {
  requireRole(user, "ADMIN");
  return {
    approvals: await db.financialApproval.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  };
}

export async function expireApprovals() {
  return db.financialApproval.updateMany({
    where: { state: { in: ["REQUESTED", "APPROVED"] }, expiresAt: { lte: new Date() } },
    data: { state: "EXPIRED" },
  });
}
