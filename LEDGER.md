# Financial ledger

The P0 accounting primitive is an append-only signed transfer ledger. It tracks exact EUR minor units across economic buckets. Each journal contains at least two nonzero entries, with one entry per account key, and the sum of all signed entries must equal zero. A positive amount increases an account bucket; a negative amount decreases it. This is a balanced operational subledger. An external financial-reporting general-ledger mapping and statutory accounting review remain separate work.

`buildBalancedTransaction` validates the immutable transaction ID, idempotency key, origin reference, ISO timestamp, posting uniqueness and balance. It returns a deeply frozen journal with EUR currency and canonical economic payload. JavaScript numbers, floating point amounts, empty postings and unbalanced journals are rejected.

Examples:

| Operation                         | Source bucket                  | Destination bucket                    |
| --------------------------------- | ------------------------------ | ------------------------------------- |
| Explicit development-only funding | development clearing, negative | advertiser funds, positive            |
| Reserve campaign media budget     | advertiser funds, negative     | campaign budget, positive             |
| Bill validated activity           | campaign budget, negative      | platform recognized revenue, positive |
| Fund distribution                 | platform revenue, negative     | global pool, positive                 |
| Finalize distribution             | global pool, negative          | participant payable buckets, positive |

Campaign budgets, advertiser available funds, event prize pools, the global distribution pool and platform retained revenue must remain distinct. A development funding transfer is not evidence of a real payment receipt.

## Integrity and concurrency

Displayed balances are derived views. `deriveAccountBalance` sums entries and rejects duplicate transaction IDs; it is not a mutable wallet balance. `assertSufficientBalances` guards protected account buckets against negative post-operation balances. Call it under the same database transaction and lock as journal insertion. A stale balance check outside that boundary is insufficient.

The database service must persist unique transaction IDs and idempotency keys; compare the incoming canonical business payload with the prior payload on replay; return the stored outcome on exact replay; and reject an altered payload with IDEMPOTENCY_CONFLICT. An idempotency key alone does not authorize changed amounts or recipients. Bind operation keys to the authenticated actor and scope.

Database transactions must cover all associated writes: campaign budget/spend recognition, validated activity state, RU/XP/Event Points and audit events. Distribution finalization atomically includes period state, snapshot, journal and RU consumption. An append-only database policy should prohibit arbitrary journal updates/deletes in production operational roles; schema/model immutability alone is not sufficient.

## Corrections

`reverseTransaction` creates a new balanced journal with exact negated postings and a reference to the original. It requires a reason and refuses repeated reversals or reversal-of-reversal shortcuts. Storage must enforce at most one full reversal per original journal. Partial refunds require explicitly modelled partial-correction operations and cumulative amount constraints; the full-reversal helper is not a partial refund engine.

Never delete financial history to resolve fraud. Corrections after revenue distribution require economic review and compensating entries, with holds where funds are unavailable. Payment and payout provider integrations must be reconciled before any live-money launch. No live financial-provider success is represented by these domain functions.
