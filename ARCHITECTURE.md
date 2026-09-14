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

Email verification, password reset, TOTP enrollment/recovery and session revocation are implemented. Single-use tokens and recovery codes are stored as digests; TOTP and outbox bodies are authenticated-encrypted using a separate server key. Password reset revokes all sessions. Administrators need a recent password plus unreplayed TOTP for critical HTTP mutations. Independent approval requests snapshot operation, target, payload and version; event settlement consumes a separately approved request inside its financial transaction. Other operation types have the foundation and MFA gate, with broader dual-approval enforcement reserved for Pass 03.

Provider callbacks have a separate raw-body route. HMAC covers provider, timestamp and exact body; bounded timestamps and immutable provider/event keys reject replay mismatches. The durable inbox and encrypted mail outbox use leases, bounded retries and dead-letter states. A scheduled worker runs bounded batches; no Redis is required. Real external adapters are intentionally unavailable.

## Economic data flow

1. An advertiser prepares and submits a campaign for review.
2. Campaign funding is recorded through a ledger operation. The current development adapter emits simulated credits only.
3. A public creator Link establishes an opaque, visitor-bound first-touch context from a server-owned entry. Authentication binds it to one account. Participants submit eligible activity using only the trusted HttpOnly cookie context; creator handles in financial requests are rejected.
4. An authorized independent review validates or rejects evidence. Validation applies deduplication, eligibility, frequency/budget controls and rule versions inside the application transaction.
5. Validated activity can independently create monetary postings, participant-class RU, XP and Event Points. A deposit alone creates no final RU.
6. A distribution preview snapshots period eligibility and rule inputs and applies the Margin Governor.
7. Finalization records the immutable distribution and ledger postings, consuming the relevant RU. Corrections remain auditable and cannot silently rewrite finalized history.

Money uses exact minor units, with exact domain arithmetic. RU is participation weight with no guaranteed monetary value. XP is durable account progression. Event Points determine an individual event's ranking. The single Global Distribution Pool is partitioned into configurable participant categories. Deterministic rounding and stable tie-breaking are required so repeated calculations agree.

The ledger is the source of monetary truth. Balances are derived from postings; no service may write an unrelated mutable balance as the authority. Idempotency keys, unique constraints and transactional persistence prevent repeated requests from duplicating value. See [LEDGER.md](LEDGER.md) for the exact posting and database invariants.

## Domains and persistence

The schema covers users/sessions/rate limits, campaigns/activity, versioned economic rules, RU entries, XP entries, events/memberships/points, ledger accounts/transactions/entries, distributions, referrals, risk events and audit logs. Public profiles reuse the user identity and explicit public projection; password hashes and sessions never belong in profile payloads.

Social URLs and follower counts begin as self-declared information. They are distinguished from manual review or trusted external verification. Provider-neutral social connectors may be introduced later; scraping and unofficial verification are not dependencies.

Referrals are direct, versioned and bounded by per-action, per-referral and period caps. Registration records acquisition but grants no RU or money. Creator and advertiser analytics aggregate actual acquisition, activity, RU and ledger records. Sponsored event ownership, media approval, prize reservation, deterministic ranking freeze and independent settlement are transactional services. Quests, a full achievement catalog, delegated co-hosting, nonzero event RU bonuses and external payouts remain future work.

## Operational decisions

PostgreSQL is also the initial transactional coordination boundary. There is no Redis or microservice dependency. Durable inbox/outbox records run through `pnpm worker:once`; the host must schedule it and monitor failures. Extract a domain only after its boundaries and scale justify the complexity.

Next standalone output keeps runtime deployment portable. Production migrations run in a separate job. The embedded PostgreSQL package is an optional local development convenience and never the production database. Configuration lives in environment or versioned database rules; public-domain defaults do not govern economics.

## Known limits

This architecture provides a foundation, not a payment license, fraud-proof measurement system or compliance certification. Live payment/payout and email delivery adapters, external social verification, automated retention/deletion operations, monitoring integrations and target recovery drills are launch work. Signed conversion processing is implemented, but provider deployment and trust agreements are not verified. Automated checks and browser verification must be reported by actual execution in [RELEASE_REPORT.md](RELEASE_REPORT.md).

## Pass 02 persistence

Four forward migrations add attribution/share/growth and direct-referral credits, event configuration/reserves/settlements, MFA/tokens/approvals/providers, and public-module/campaign-discovery fields. Prisma models include the corresponding restrictive foreign keys. Raw SQL also enforces append-only financial origins, finalized state freezes and deferred accounting reconciliation. Never replace these migrations with `db push`. PostgreSQL serialization retries cover Prisma P2034 and the pg adapter’s P2010 SQLSTATE 40001/40P01 wrappers.

Public profile modules store order and visibility separately from user-authored links. Server projections choose eligible funded opportunities. Dynamic profile/event/earned-milestone cards use escaped database text and one canonical PNG derivative; no remote image fetch or new artwork model is involved.
