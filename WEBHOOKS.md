# Webhooks

Ruvora accepts signed callbacks through `POST /api/webhooks/<provider>`, stores a durable inbox entry, then processes it asynchronously with `pnpm worker:once`. Receipt returns HTTP 202 with inbox ID, current state and duplicate status. Acceptance is not financial validation or successful processing.

## Authentication and receipt

Provider IDs are allowlisted: `conversion`, `payment`, `development-conversion`, `development-payment`. Development IDs are forbidden outside development. The two non-development IDs use separate `CONVERSION_WEBHOOK_SECRET` and `PAYMENT_WEBHOOK_SECRET`; development IDs use `DEV_WEBHOOK_SECRET`. Secrets must contain at least 32 bytes; generate cryptographically random values and keep them in a secret store.

The `x-ruvora-signature` header format is `t=<unix-seconds>,v1=<lowercase-hex>`. The signature is HMAC-SHA256 over the concatenation of:

1. The provider ID, a period, the decimal timestamp and a period, encoded as UTF-8.
2. The exact raw request body bytes, without parsing, normalization or reserialization.

This application-specific envelope uses the [RFC 2104](https://www.rfc-editor.org/rfc/rfc2104) HMAC construction. Sign with `signWebhook(provider, rawBytes, secret, timestamp)` from `src/server/security/webhook-signature.ts`. Verification compares signatures in constant time and requires a timestamp within five minutes of the server clock. Keep clocks synchronized. HTTPS remains required; HMAC authenticates content and does not encrypt it.

The dedicated route reads at most 32 KiB before JSON parsing and does not use browser Origin authentication. Signed callbacks cannot submit another provider purpose, such as a payment event through a conversion provider. A new event's business `occurredAt` must be no more than 30 days old or five minutes in the future. Retries can re-sign the original unchanged bytes with a fresh signature timestamp.

The envelope is:

```json
{
  "id": "provider-event-unique-id",
  "type": "conversion.verified",
  "occurredAt": "2026-09-14T12:00:00.000Z",
  "data": {
    "activityId": "existing-activity-id",
    "campaignId": "matching-campaign-id",
    "externalConversionId": "provider-conversion-id",
    "convertedAt": "2026-09-14T12:00:00.000Z",
    "valueMinor": "100",
    "currency": "EUR"
  }
}
```

The timestamp above is illustrative and must be current for a new callback. Do not paste credentials or real recovery tokens into callback examples. Identifiers are bounded; monetary values are decimal strings, never binary floating-point calculations.

PostgreSQL enforces unique `(provider, externalId)`. The inbox stores a SHA-256 hash of the exact envelope bytes. Exact duplicates return the existing entry even under concurrent delivery; the same event ID with changed bytes fails with `WEBHOOK_IDEMPOTENCY_CONFLICT`. Whitespace or JSON-key-order changes are also changed bytes. Event identity, payload and provenance cannot be rewritten after receipt.

## Conversion processing

Supported decisions are `conversion.verified`, `conversion.rejected` and `conversion.reversed`. All share the example data shape. `valueMinor` is optional and nonnegative; EUR is the supported currency. The activity must already exist, belong to the submitted campaign and have type CONVERSION. The conversion time must be inside the campaign's half-open time window, no earlier than five minutes before activity creation and no later than five minutes after the provider event time. Development evidence cannot validate a non-demo campaign.

Provider conversion identity binds activity, campaign, time, optional value and currency. Each provider may correlate only one conversion per activity. Repeated identical decisions have no new economic effect. Reversal requires an original conversion; REJECTED and REVERSED are terminal and cannot become VERIFIED again.

Successful verification stores provider evidence and an audit entry with no human actor ID. Independent administrator review performs financial validation through the activity service. A provider rejection/reversal records risk evidence; for an already validated activity it places the participant and reward beneficiaries on economic hold pending independent review. It does not directly reverse RU, XP, Event Points or money and cannot edit finalized distributions or prizes. Reviewers must use the separately authorized reversal workflow where allowed.

## Payment processing

Only development payment reconciliation is implemented. `payment.confirmed` data contains `operationId`, `externalPaymentId`, `amountMinor` and EUR `currency`, which must match an existing confirmed development DEPOSIT. It acknowledges the receipt without another ledger entry.

`payment.refunded` and `payment.chargeback` contain `depositId`, positive `amountMinor`, EUR `currency` and a reason of 10–500 characters. The processor derives the owner from the original payment, never from a callback user ID, and creates an idempotent compensating ledger transaction. Cumulative corrections are capped at the original deposit and available advertiser funds must cover them. Insufficient available funds require reviewed recovery; there is no negative-balance bypass.

The `payment` provider inbox can authenticate and retain a callback when configured, but processing deliberately returns `PAYMENT_PROVIDER_UNAVAILABLE` until a real payment adapter/reconciliation contract is connected. No live money receipt, refund, chargeback settlement or payout delivery is claimed.

## Queue and operator recovery

Inbox states are RECEIVED, PROCESSING, PROCESSED, RETRY and DEAD_LETTER. A worker claims a 60-second lease and increments the attempt count transactionally. Business effects and PROCESSED status commit in the same serializable transaction; a failure rolls back the effects. A stale lease can be reclaimed, while a valid lease prevents a second worker from applying the operation. Exact processing replay returns the existing status.

Failed attempts store only a stable error code and retry with exponential backoff, starting at 60 seconds and capped at one hour. Five failed attempts place the entry in DEAD_LETTER. Permanent validation failures follow this same bounded policy; they do not retry indefinitely. The worker is a bounded command, not a supervised deployment service; configure a scheduler/worker process and alert on queue age, retries and dead letters.

An ADMIN can inspect metadata through `GET /api/admin/webhooks`. `POST /api/admin/webhooks/<id>/retry` requires fresh password plus MFA and a reason; it accepts only RETRY/DEAD_LETTER, audits prior attempts/error, resets the retry budget and preserves the original payload. Correct the external/configuration cause before retrying. If the payload itself is invalid, send a distinct corrected provider event and preserve the rejected original; never edit history in place. PROCESSED entries cannot be manually replayed through this endpoint.

Do not log signature headers, raw credentials or sensitive provider payloads. Production needs a retention/redaction policy, provider contract testing, reconciliation alerts, monitored scheduling and operator runbooks for delayed, out-of-order and disputed events. The current inbox proves signed correlation and durable replay foundations, not a completed external payment integration.
