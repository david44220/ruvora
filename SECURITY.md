# Security

Ruvora separates browser interaction from authority over accounts, budgets, validation and distributions. Development fixtures and simulated funding must remain isolated from production.

This document describes implemented foundations and required follow-up work. It is not a claim of certification, penetration-test completion or readiness to handle live funds.

## Implemented foundations

- Passwords use a random salt and scrypt hashing; comparison uses a timing-safe primitive. Registration enforces a minimum password length.
- Sessions use random opaque credentials; the database stores token digests, expiry and ownership. Login/session lookup rejects suspended users and logout revokes the session.
- Production uses secure host-prefixed session cookies. Cookie flags and HTTPS/proxy behavior must be exercised in the target environment.
- Multi-role accounts are authorized server-side. Ordinary signup cannot grant ADMIN; ownership and independent reviewer checks belong in application services.
- Mutating cookie-authenticated requests enforce exact `APP_URL` Origin and fetch-site expectations. Backend callers must supply the intended same-origin context.
- Input schemas constrain roles, identifiers, URLs and monetary inputs. Prisma parameterization prevents string-built query injection; any raw SQL requires explicit review.
- Persistent PostgreSQL rate-limit counters protect authentication identifiers. Economic idempotency, uniqueness, transaction boundaries and audit records provide separate replay protections.
- Security headers disable framing, restrict browser capabilities and apply a Content Security Policy. The present policy permits inline framework scripts/styles; nonce-based hardening is follow-up work.
- Development seed/funding are explicit feature gates that refuse production use. No live payment or payout adapter is connected.

Economic invariants are documented in [LEDGER.md](LEDGER.md), [RU_ENGINE.md](RU_ENGINE.md) and [ECONOMY.md](ECONOMY.md). Security includes preserving accounting history and preventing unapproved value creation.

## Secrets and environments

Commit only `.env.example`; keep actual secrets in local ignored files or the production secret store. Never log passwords, raw session tokens, database URLs, payment secrets or sensitive uploaded evidence. Nothing prefixed `NEXT_PUBLIC_` is secret.

The embedded local database uses intentionally public development credentials and loopback binding. It is not a production service. Replace credentials and restrict network access for staging/production. Do not expose the Compose database port beyond the intended host.

The development seed uses an operator-provided `DEMO_PASSWORD` shared among documented `@ruvora.test` fixtures. These accounts must never become production administrators. The separate `scripts/bootstrap-admin.ts` requires `ALLOW_ADMIN_BOOTSTRAP=true`, an explicit email and a password of at least 16 characters. It refuses to proceed when any admin exists or the email belongs to an existing account; it creates a non-demo admin and an audit record without initializing funds or rules. Verify this procedure in the target environment, remove bootstrap variables afterward, and add administrator recovery/MFA before launch.

## Email verification and recovery design

No transactional mail provider is configured and no delivered verification/reset flow is claimed. Implement one-time purpose-bound token digests, short expiry, atomic consumption, rate-limited requests, generic anti-enumeration responses, a provider-neutral mail adapter and a durable outbox. Verification must set its timestamp only after token redemption. Password recovery must revoke existing sessions and notify the account. Avoid returning reset/verification tokens through public production API responses.

Passkeys/MFA, stronger administrator authentication and recovery, session/device inventory and revoke-all controls are required hardening work.

## Trust, privacy and policy

Follower counts and social profile information are self-declared unless explicitly reviewed or verified through a trusted provider. Do not label them externally verified or rely on scraping.

Validated activity requires independent trusted review; a client click is not proof of legitimate advertising delivery. Production needs documented evidence sources, fraud triage, rate/velocity controls, economic holds and appeal handling. Do not add invasive fingerprinting as a shortcut.

Age/country/role/risk/payment availability rules must fail closed where required information is unknown. A configured policy engine is not a legal determination. Public launch requires operator-approved jurisdiction, privacy, advertising, prize, retention and payment policies.

Data export, account deletion, pseudonymization, consent and retention workflows must be completed. Monetary/audit retention cannot be implemented by silently deleting ledger history. Minimize stored personal data and restrict administration access.

## Payments and launch gates

Live advertiser funding and payouts are disabled in this first implementation. Before enabling them, implement signed provider webhook verification, idempotency, replay handling, receipt reconciliation, refund/chargeback paths, payout approval, KYC/KYB where needed, and accounting recovery scenarios. Provider amounts and currencies must be validated against server-side expectations.

Also require dependency/image scanning, least-privilege runtime and database access, production TLS verification, rate-limit cleanup, edge abuse protection, backup restoration tests, monitoring/alerts, incident response, a security review and target-environment testing.

## Vulnerability reporting

The canonical repository is the private `david44220/ruvora` repository. No dedicated security contact or private vulnerability reporting configuration has been verified. Report privately to the operator through an established private channel; configure and document the reporting channel before public launch. Do not publish exploit details, personal data or credentials in public issues.
