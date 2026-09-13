import {
  canonicalPayload,
  EconomicError,
  freezeDeep,
  isoInstant,
  requireIdentifier,
} from "./shared";

export interface LedgerEntry {
  readonly accountKey: string;
  readonly amountMinor: bigint;
}
export interface LedgerTransactionInput {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly reference: string;
  readonly occurredAt: string;
  readonly entries: readonly LedgerEntry[];
  readonly reversalOf?: string;
  readonly reason?: string;
}
export interface LedgerTransaction extends LedgerTransactionInput {
  readonly currency: "EUR";
  readonly payload: string;
}

/** Signed transfer ledger: positive credits a bucket, negative debits it. */
export function buildBalancedTransaction(
  input: LedgerTransactionInput,
): Readonly<LedgerTransaction> {
  requireIdentifier(input.id, "transaction id");
  requireIdentifier(input.idempotencyKey, "idempotency key");
  requireIdentifier(input.reference, "origin reference");
  isoInstant(input.occurredAt, "occurredAt");
  if (input.entries.length < 2) throw new EconomicError("INSUFFICIENT_POSTINGS");
  const seen = new Set<string>();
  let total = 0n;
  for (const entry of input.entries) {
    requireIdentifier(entry.accountKey, "account key");
    if (seen.has(entry.accountKey)) throw new EconomicError("DUPLICATE_POSTING_ACCOUNT");
    seen.add(entry.accountKey);
    if (typeof entry.amountMinor !== "bigint" || entry.amountMinor === 0n)
      throw new EconomicError("INVALID_POSTING_AMOUNT");
    total += entry.amountMinor;
  }
  if (total !== 0n) throw new EconomicError("UNBALANCED_TRANSACTION");
  if (input.reversalOf) {
    requireIdentifier(input.reversalOf, "reversal source");
    requireIdentifier(input.reason ?? "", "reversal reason");
    if (input.reversalOf === input.id) throw new EconomicError("SELF_REVERSAL");
  }
  const normalized = {
    ...input,
    entries: input.entries.map((entry) => ({ ...entry })),
    currency: "EUR" as const,
  };
  // Identifiers/timestamp are part of an operation's immutable envelope, but retries
  // compare its economic request independently of newly generated transport IDs.
  const payload = canonicalPayload({
    reference: input.reference,
    entries: normalized.entries,
    reversalOf: input.reversalOf,
    reason: input.reason,
    currency: "EUR",
  });
  return freezeDeep({ ...normalized, payload });
}

export function deriveAccountBalance(
  transactions: readonly LedgerTransaction[],
  accountKey: string,
): bigint {
  const seen = new Set<string>();
  return transactions.reduce((balance, transaction) => {
    if (seen.has(transaction.id)) throw new EconomicError("DUPLICATE_TRANSACTION");
    seen.add(transaction.id);
    return (
      balance +
      transaction.entries
        .filter((entry) => entry.accountKey === accountKey)
        .reduce((sum, entry) => sum + entry.amountMinor, 0n)
    );
  }, 0n);
}

/** Must run inside the same serialized database transaction as insertion. */
export function assertSufficientBalances(
  transaction: LedgerTransaction,
  balances: Readonly<Record<string, bigint>>,
  protectedAccountKeys: readonly string[],
): void {
  for (const accountKey of protectedAccountKeys) {
    const amount =
      transaction.entries.find((entry) => entry.accountKey === accountKey)?.amountMinor ?? 0n;
    if ((balances[accountKey] ?? 0n) + amount < 0n)
      throw new EconomicError("INSUFFICIENT_FUNDS", accountKey);
  }
}

export function reverseTransaction(
  original: LedgerTransaction,
  input: { id: string; idempotencyKey: string; occurredAt: string; reason: string },
  alreadyReversed = false,
): Readonly<LedgerTransaction> {
  if (alreadyReversed || original.reversalOf) throw new EconomicError("ALREADY_REVERSED");
  return buildBalancedTransaction({
    ...input,
    reference: original.reference,
    reversalOf: original.id,
    entries: original.entries.map((entry) => ({
      accountKey: entry.accountKey,
      amountMinor: -entry.amountMinor,
    })),
  });
}
