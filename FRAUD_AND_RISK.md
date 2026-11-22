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

## Pass 02 trust boundaries

Attribution originates in server-owned opaque share entries, never participant creator identifiers. Separate random visitor tokens and immutable context policy prevent cross-account and replay alteration. Direct referrals exclude self/advertiser relationships and duplicate activity credit. Account holds and current eligibility are rechecked inside economic transactions.

Event configuration locks after submission, requires independent media/event approval and fully reserved prizes before activation. Owners/sponsors/hosts cannot participate in their own prizes; held/disqualified accounts are excluded and ranking changes invalidate a stale preview. Event points and activities freeze at settlement; finalized history needs separately reviewed compensation rather than silent edits.

Signed provider conversion evidence does not make arbitrary client submissions billable. Verified/reversed evidence records and risk holds are durable; independent review remains the financial decision. Payment deposits, refunds and chargebacks are development simulations. Cryptographic controls do not establish external measurement quality, KYC/KYB or anti-Sybil guarantees.

## Pass 04 server risk scoring, audience verification & export safety

- **Server risk scoring (`src/server/risk.ts`):** Every submitted activity receives a deterministic server-computed `riskScore` (`0–100`) and `riskSignals` list derived solely from trusted database state (prior reversals, recent rejection counts, hourly velocity, rapid attribution windows, unverified conversion evidence, and new-account bursts). Risk scores and signals are persisted on `Activity`, recorded in `AuditLog`, passed into `validateActivity`, and surfaced directly on Admin review cards alongside signed webhook conversion indicators.
- **Creator reliability & XP-only quests (`src/server/risk.ts`, `src/server/quests.ts`):** Creator reliability scores (`0–100%`) and trust tiers (`EXPLORER`, `TRUSTED`, `AMBASSADOR`) derive solely from persisted validated/rejected/reversed actions and verification states. Progression quests (`QuestClaim`) award strictly **XP** and never create Money, Reward Units, or Event Points.
- **Lightweight audience verification (`src/server/audience-verify.ts`):** Creators starting at 10 followers can complete a bio-code challenge (`ruvora-verify-XXXXXXXX`) paired with a platform-domain-checked HTTPS profile URL to earn the `VERIFIED` badge. Provenance is honestly persisted (`BIO_CODE_CHALLENGE` / `BIO_CODE_CHALLENGE_DEV`) with no false claim of third-party OAuth follower-count auditing. Inflating declared followers above the verified count resets `audienceStatus` back to `SELF_DECLARED`.
- **CSV export safety (`src/server/export.ts`):** Wallet ledger statements and advertiser ROI exports apply RFC 4180 escaping and neutralize spreadsheet formula-injection prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) before download.
- **Advertiser integration keys (`src/server/integrations.ts`):** Per-advertiser signing keys are generated with 192-bit entropy, encrypted at rest using record-bound AES-256-GCM (`sealSecret`), shown once upon rotation, and never returned in plaintext on subsequent reads. Development conversion callback tests are strictly gated to `APP_ENV=development` and still require independent Admin validation before any financial movement.
