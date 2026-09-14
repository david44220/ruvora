# Advertising and validated activity

Ruvora rewards legitimate delivered advertising outcomes. The pure engine in `src/domains/economy/activity.ts` separates activity validation from reward calculation. Campaign configuration and durable orchestration live in the server/database modules.

Supported activity vocabulary is IMPRESSION, QUALIFIED_VIEW, CLICK, CONVERSION, CREATOR_PROMOTION and SPONSORED_MISSION. Each campaign has an explicit allowed subset. A browser click or a deposited budget is not automatically a validated outcome.

`validateActivity` evaluates trusted server signals: authenticated participant, policy eligibility, ACTIVE campaign, allowed activity type, half-open campaign time window, duplicate detection, per-participant frequency cap, positive billable cost, remaining total and daily budgets, self-participation protection and verified conversion evidence. The server computes or validates these signals; it must not accept budget, risk score or validation status from a client request as authoritative.

The function returns REJECTED with all applicable reasons for a hard failure. Otherwise risk at or above the configured review threshold yields PENDING_VALIDATION. Only an eligible low-risk result becomes VALIDATED. Suspicious activity creates no final reward while pending. Rules and reason codes remain auditable.

The lifecycle transition guard supports RECEIVED to PENDING_VALIDATION/REJECTED, PENDING_VALIDATION to VALIDATED/REJECTED, and VALIDATED to REVERSED. Rejected/reversed events are terminal. Receipt, eligibility, validation, billing and rewarding are distinct recorded stages even when one database transaction completes several stages.

A successful service transaction must atomically enforce duplicate protection, reserve/debit campaign funds, record billable recognized revenue, create the validated origin, mint each eligible recipient/category RU once, and append separate XP/Event Point records. Database uniqueness and serializable locking are required: pure functions alone cannot prevent two workers consuming the same last campaign cent.

`calculateActivityRewards` produces user RU, optional independent eligible-creator RU and advertiser RU from the billable validated origin. Configurable rates and the immutable rule version travel with the award. Advertising self-participation is disallowed. Reversals preserve the original activity and produce compensating economic records or post-finalization review.

Development activity simulation must be clearly labelled and disabled where real provider verification is required. No view-duration verification, conversion-provider certification, external social verification or live ad delivery should be inferred from the pure validation function. Future providers must supply verifiable evidence through provider-neutral adapters.

## Pass 02 attribution and provider evidence

The activity request accepts campaign, type, optional linked event, evidence and idempotency key. It rejects creator/referrer IDs and handles. An internal third argument containing opaque cookie credentials resolves server-owned creator provenance; the snapshot and complete request fingerprint are persisted before pending review. Current campaign regions and attributed creator targeting are enforced again at validation.

Signed conversion callbacks are stored by the provider foundation. A conversion with provider REJECTED or REVERSED decision cannot validate, including in development. Nondemo conversion validation requires a stored VERIFIED provider decision. Only an explicitly simulated development campaign may use an independent administrator's attested manual evidence instead. Callback receipt never invents an administrator or automatically mints RU; negative provider decisions preserve financial history and open review/holds for previously validated recipients.

Campaign entries and submissions record deduplicated real starts, but a start creates no financial value. Analytics reports actual reviewed delivery, creator attribution, billed spend, reversals and distinct advertiser RU. Event-linked reviews and reversals lock the event and prevent host/sponsor self-farming or post-settlement ranking changes. See ATTRIBUTION_ENGINE.md, REFERRAL_ENGINE.md, EVENT_ENGINE.md and provider security documentation for the detailed boundaries.
