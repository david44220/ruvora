# Fraud, risk and policy foundation

The core uses a centralized policy gate plus auditable advertising validation. These are integrity controls and extension points, not a claim of comprehensive fraud detection or legal certification.

`src/domains/policy/index.ts` supports multi-role accounts and gates PUBLIC_PROFILE, PARTICIPATE, CREATOR_MONETIZATION, ADVERTISE, EVENT_JOIN, DISTRIBUTION, PAYOUT and ADMINISTRATION. Economic operations fail closed on unknown/invalid date of birth, age below a configurable minimum, unavailable/unknown country, blocked region, account suspension or economic hold. Role requirements apply to creator, advertiser and administrative actions. Creator access uses a configurable follower threshold; it never implies a guaranteed income or externally verified audience.

Advertising review/KYB and payout KYC/provider-country availability are explicit configuration. An empty provider-country allowlist means payouts are unavailable. Administrator roles do not automatically bypass economic holds or country/age rules. Dates use calendar birthday comparison; caller time is explicit and deterministic.

The server must provide trusted identity, risk, role and policy state and enforce authorization on every write. Client-side visibility is not authorization. Self-declared social metrics must retain their provenance and cannot be displayed as externally verified.

## Economic abuse controls

- Activity deduplication, frequency caps, campaign total/daily funding constraints, time windows, campaign lifecycle and authenticated eligibility.
- Advertiser self-participation rejection and no RU for funding/deposits.
- Verified conversion evidence requirement and configurable risk-review threshold.
- Separate pending, rejected, validated, consumed and reversed audit states.
- Unique source references and transactionally enforced idempotency for every economic award.
- Direct referrals only, shared-verified-identity/self rejection, no referral-on-referral compensation and per-activity/period/count caps.
- Event-scoped points, duplicate origin rejection and exact compensating reversals.
- Held participants excluded from financial allocation and RU consumption.

Database isolation and unique constraints are mandatory complements to the deterministic checks. Rate-limiting, verified provider evidence, risk scoring and secure administrator review belong to server infrastructure; counters supplied to these functions must be measured over documented scopes and atomically updated. An in-process limiter alone does not protect a multi-replica deployment.

Use data minimization: retain the evidence needed for disputes and audit under a defined retention policy, avoid invasive fingerprints, and never log secrets or unnecessary personal details. Shared verified identity is an authoritative risk signal, not an invitation to scrape private data.

A reversal before distribution removes pending/validated RU through an auditable state transition. A reversal after consumption returns a post-finalization review requirement and economic hold. Reviewed compensating financial operations preserve the original distribution and journal. No code should silently edit final balances/history or invent an unapproved clawback.

## P0 persistence adapter

`evaluatePersistedPolicy` adapts the database's adult-attestation, onboarding and terms-acceptance fields to the same central module. It accepts PARTICIPATION, CREATOR_MONETIZATION and DISTRIBUTION, returns explicit eligibility/reasons, checks fresh account holds/country/terms/onboarding, and applies the creator role and follower threshold. The stored `ageEligible` flag is self-declared adult attestation, not externally verified date of birth. Stronger age assurance and provider KYC remain separate policy integration work.
