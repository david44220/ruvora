# Architecture

Ruvora starts as a modular monolith: one Next.js application and one PostgreSQL database, with explicit domain services. The goal is a coherent product slice whose financial rules can be tested independently from the UI and whose persistence can enforce transactional integrity.

## Layers

| Layer        | Location                                    | Responsibility                                                                                     |
| ------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Web          | `src/app`, `src/components`                 | Pages, navigation, accessible forms, dictionary-backed copy and HTTP adaptation                    |
| Application  | `src/server`                                | Authentication, authorization, request validation, database transactions and use-case coordination |
| Economy      | `src/domains/economy`                       | Deterministic exact-money, RU, XP, Event Point, distribution and margin calculations               |
| Policy       | `src/domains/policy`                        | Versioned eligibility decisions with explicit reasons                                              |
| Persistence  | `prisma/schema.prisma`, `prisma/migrations` | Relations, unique keys, exact numeric fields, indexes and integrity constraints                    |
| Localization | `src/i18n`                                  | EN/FR messages and locale helpers                                                                  |
| Assets       | `public`, asset manifest                    | Reused canonical raster artwork and delivery encodings                                             |
| Operations   | `scripts`, Dockerfile, Compose, CI          | Local database, seed, migrations, build/test/deploy contract                                       |

Request handlers should remain adapters: validate inputs, resolve the actor, enforce permissions, call a use case, and return a stable response. Business calculations do not belong in React components. Browser-provided amounts, roles, event scores or “validated” flags cannot grant economic authority.

## Identity and authorization

Accounts may carry several roles simultaneously. Ordinary registration cannot grant ADMIN. Passwords are salted and hashed with scrypt; session credentials are random opaque tokens with only their SHA-256 digests stored in PostgreSQL. Login checks suspension, session lookup checks expiry, and logout revokes the current database session. Production cookies use the secure host-prefixed form.

Mutations enforce the configured request origin and server-side role/ownership checks. Identifier-based rate-limit counters persist in PostgreSQL, supporting multiple application instances without introducing Redis. Broader edge traffic controls, expiry cleanup and operational tuning remain required.

The separate `scripts/bootstrap-admin.ts` creates the first non-demo administrator from explicit operator environment values, refuses an existing admin or existing email, and writes an audit event. It initializes no economic rules or money.

Email verification and password reset are architectural follow-up work, not active delivery features. A provider-neutral notification port should accept a template key, locale, recipient and single-use token URL. Store only token digests with purpose, expiry and consumed timestamp; consume transactionally, avoid account enumeration, rate-limit issuance/redemption, and revoke sessions after a successful password reset. Add a transactional outbox so database state and mail delivery cannot drift. No fake “verified” badge or success message should substitute for a completed mail flow.

## Economic data flow

1. An advertiser prepares and submits a campaign for review.
2. Campaign funding is recorded through a ledger operation. The current development adapter emits simulated credits only.
3. Participants submit eligible activity, which enters a pending validation state.
4. An authorized independent review validates or rejects evidence. Validation applies deduplication, eligibility, frequency/budget controls and rule versions inside the application transaction.
5. Validated activity can independently create monetary postings, participant-class RU, XP and Event Points. A deposit alone creates no final RU.
6. A distribution preview snapshots period eligibility and rule inputs and applies the Margin Governor.
7. Finalization records the immutable distribution and ledger postings, consuming the relevant RU. Corrections remain auditable and cannot silently rewrite finalized history.

Money uses exact minor units, with exact domain arithmetic. RU is participation weight with no guaranteed monetary value. XP is durable account progression. Event Points determine an individual event's ranking. The single Global Distribution Pool is partitioned into configurable participant categories. Deterministic rounding and stable tie-breaking are required so repeated calculations agree.

The ledger is the source of monetary truth. Balances are derived from postings; no service may write an unrelated mutable balance as the authority. Idempotency keys, unique constraints and transactional persistence prevent repeated requests from duplicating value. See [LEDGER.md](LEDGER.md) for the exact posting and database invariants.

## Domains and persistence

The schema covers users/sessions/rate limits, campaigns/activity, versioned economic rules, RU entries, XP entries, events/memberships/points, ledger accounts/transactions/entries, distributions, referrals, risk events and audit logs. Public profiles reuse the user identity and explicit public projection; password hashes and sessions never belong in profile payloads.

Social URLs and follower counts begin as self-declared information. They are distinguished from manual review or trusted external verification. Provider-neutral social connectors may be introduced later; scraping and unofficial verification are not dependencies.

Referrals are bounded to direct attribution. Signup does not generate financial value. Quests, achievements, expanded analytics, sponsored prizes and payout provider processing remain follow-up capabilities unless the release report explicitly records a completed implementation.

## Operational decisions

PostgreSQL is also the initial transactional coordination boundary. There is no Redis, background queue deployment or microservice dependency. Introduce a queue only when durable asynchronous work requires it, using an outbox/inbox protocol and idempotent consumers. Extract a domain only after its boundaries and scale justify the complexity.

Next standalone output keeps runtime deployment portable. Production migrations run in a separate job. The embedded PostgreSQL package is an optional local development convenience and never the production database. Configuration lives in environment or versioned database rules; public-domain defaults do not govern economics.

## Known limits

This architecture provides a foundation, not a payment license, fraud-proof measurement system or compliance certification. Live payments/payouts, trusted conversion delivery, external social verification, transactional email, full privacy workflows, production operator recovery/hardening, monitoring integrations and recovery drills are launch work. Automated checks and browser verification must be reported by actual execution in [RELEASE_REPORT.md](RELEASE_REPORT.md).
