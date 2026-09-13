import type { AccountKind } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Tx } from "./db";
import { assert } from "./errors";
export async function account(
  tx: Tx,
  id: string,
  kind: AccountKind,
  owner: { userId?: string; campaignId?: string; eventId?: string } = {},
) {
  const result = await tx.ledgerAccount.upsert({
    where: { id },
    create: { id, kind, ...owner },
    update: {},
  });
  assert(
    result.kind === kind &&
      result.userId === (owner.userId ?? null) &&
      result.campaignId === (owner.campaignId ?? null) &&
      result.eventId === (owner.eventId ?? null),
    "ACCOUNT_OWNER_MISMATCH",
    "An account cannot change economic purpose or ownership.",
    409,
  );
  return result;
}
export async function balance(tx: Tx, accountId: string): Promise<bigint> {
  return (
    (await tx.ledgerEntry.aggregate({ where: { accountId }, _sum: { amountMinor: true } }))._sum
      .amountMinor ?? 0n
  );
}
/** Signed bucket accounting: every operation is immutable and sums exactly to zero. */
export async function postLedger(
  tx: Tx,
  input: {
    key: string;
    kind: string;
    referenceId: string;
    description: string;
    isDemo?: boolean;
    reversesId?: string;
    entries: { accountId: string; amountMinor: bigint }[];
  },
) {
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.key },
    include: { entries: true },
  });
  if (existing) {
    assert(
      existing.kind === input.kind &&
        existing.referenceId === input.referenceId &&
        existing.entries.length === input.entries.length &&
        input.entries.every((entry) =>
          existing.entries.some(
            (previous) =>
              previous.accountId === entry.accountId && previous.amountMinor === entry.amountMinor,
          ),
        ),
      "IDEMPOTENCY_CONFLICT",
      "This operation key was already used for a different operation.",
      409,
    );
    return existing;
  }
  assert(
    input.entries.length >= 2 &&
      input.entries.reduce((sum, item) => sum + item.amountMinor, 0n) === 0n,
    "UNBALANCED_LEDGER",
    "Ledger entries must balance.",
  );
  assert(
    input.entries.every((item) => item.amountMinor !== 0n),
    "ZERO_LEDGER_ENTRY",
    "Ledger entries must be nonzero.",
  );
  assert(
    new Set(input.entries.map((item) => item.accountId)).size === input.entries.length,
    "DUPLICATE_ACCOUNT",
    "Merge entries for the same account.",
  );
  for (const entry of [...input.entries].sort((a, b) => a.accountId.localeCompare(b.accountId))) {
    const target = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: entry.accountId } });
    if (target.kind !== "CASH_CLEARING")
      assert(
        (await balance(tx, entry.accountId)) + entry.amountMinor >= 0n,
        "INSUFFICIENT_FUNDS",
        "The operation exceeds available funds.",
        409,
      );
  }
  return tx.ledgerTransaction.create({
    data: {
      id: randomUUID(),
      idempotencyKey: input.key,
      kind: input.kind,
      referenceId: input.referenceId,
      description: input.description,
      reversesId: input.reversesId,
      isDemo: input.isDemo ?? false,
      entries: { create: input.entries },
    },
    include: { entries: true },
  });
}
