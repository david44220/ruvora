# Providers

The current adapters are explicit development simulations. No payment processor, bank, email delivery network, payout provider or externally verified audience integration is connected. Provider interfaces define boundaries; their existence does not mean live integrations are operational.

## Payments

`src/server/providers/payments.ts` defines deposit, refund, chargeback and payout requests/receipts. Amounts are exact integer minor units and currency is EUR. A receipt identifies its provider and external operation and labels simulated delivery. The selected development adapter requires `APP_ENV=development`, `PAYMENT_PROVIDER=development` and `ALLOW_DEMO_FUNDING=true`. Staging and production refuse it regardless of the framework development/build mode. Payout always fails closed with `PAYOUT_UNAVAILABLE`.

The implemented advertiser endpoints are:

| Endpoint                     | Behavior                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| GET `/api/payments/account`  | Own advertiser available balance, operation history and development funding availability.          |
| POST `/api/payments/deposit` | Explicit simulated deposit with `amountMinor`, EUR currency and `idempotencyKey`.                  |
| POST `/api/payments/refund`  | Own development deposit correction with `depositId`, amount, currency, idempotency key and reason. |

A deposit posts a balanced ledger transaction from `platform:cash-clearing` (CASH_CLEARING) to `advertiser:<userId>` (ADVERTISER_AVAILABLE). It never awards RU, XP or Event Points. Event prize funding subsequently moves available advertiser funds into the dedicated event prize account through the event service. Every development financial record remains marked as simulated.

Deposit keys bind account, kind, exact amount and currency. Concurrent retries create one payment and one ledger transaction; reusing a key with different inputs fails. Confirmed payment records cannot be edited. Refunds and development chargebacks reference the original deposit, cumulatively cannot exceed it, and post a new balanced compensating transaction. They never edit the original ledger. Available funds cannot become negative: spent funds return `INSUFFICIENT_FUNDS` and require reviewed recovery. This is not a live bank-debt or chargeback collection implementation.

Signed development payment callbacks reconcile an already server-recorded deposit confirmation or process a correlated refund/chargeback. They do not accept arbitrary callback deposits or trust browser-supplied receipt amounts. See [WEBHOOKS.md](WEBHOOKS.md). The non-development payment callback path deliberately fails with `PAYMENT_PROVIDER_UNAVAILABLE` until a real provider's verified receipt reconciliation is implemented and tested.

## Conversion evidence

`src/server/providers/conversions.ts` correlates provider events to an existing conversion activity and its campaign. It validates conversion identity, activity/campaign identity, time, currency, optional value and development provenance. Provider verification records evidence; it does not impersonate an ADMIN or automatically award value.

Independent activity review requires verified conversion evidence outside explicit development manual-evidence fixtures. Rejected or reversed provider decisions block new validation in every environment. Reversal of already validated evidence creates economic risk holds for the participant and reward beneficiaries, preserving the financial history for separately authorized human review. Frozen distributions/event settlements retain their existing reversal protections. Neither a provider rejection nor a browser assertion silently rewrites finalized money.

A provider's external conversion ID and per-activity correlation are unique. Rejected/reversed decisions cannot be resurrected by a later verified callback. The system supports validation/rejection/reversal evidence foundations, not an autonomous conversion billing pipeline.

## Email

`EmailProvider.deliver(message, idempotencyKey)` receives the decrypted message only inside the worker and returns a provider reference plus a simulated flag. The development provider returns a deterministic local delivery reference and performs no network request. Full mail messages remain encrypted in PostgreSQL; public production endpoints do not expose tokens.

`EMAIL_PROVIDER=development` is permitted only in development. With no configured live adapter, outbox processing retries and eventually reaches DEAD_LETTER; a queued password-recovery message is not evidence of external delivery. `pnpm worker:once` processes a bounded batch of mail and callback inbox records and expires approvals. A deployment must schedule it, monitor the queues and implement a real adapter with provider-side idempotency. A crash after external delivery but before database acknowledgment can retry the same message; the external provider must honor the supplied stable key.

The authenticated development mailbox and private local operator CLI are documented in [SECURITY.md](SECURITY.md). Sensitive local mail files are temporary credentials, not test artifacts for source control.

## Configuration and launch boundaries

Required local secrets are `SECURITY_ENCRYPTION_KEY` (32 random bytes, canonical base64), a long `DEV_WEBHOOK_SECRET`, and an explicit development-only `DEMO_TOTP_SECRET` when seeded authenticator fixtures are needed. Never log them. Non-development conversion/payment signature keys are separately configured as `CONVERSION_WEBHOOK_SECRET` and `PAYMENT_WEBHOOK_SECRET`; setting a key does not connect a payment processor.

Production activation requires a selected provider, verified credentials, receipt schema/account mapping, signed reconciliation, currency/amount validation, real refund/chargeback/payout recovery policy, email sender/domain setup, durable worker monitoring, contract tests, and target-environment operational evidence. Test-only fixtures use separate encryption material and an isolated database. Do not run development workers against a production database or reuse local credentials.
