# Deployment to Abacus AI infrastructure / SuperComputer

Ruvora is packaged as a portable Node.js application with PostgreSQL. This runbook describes the deployment contract; it does not claim access to, deployment on, or validation of an Abacus account. No proprietary Abacus service or SDK is required by the business domains.

## Runtime contract

| Component           | Required configuration                                            |
| ------------------- | ----------------------------------------------------------------- |
| Runtime             | Node.js 24 LTS or the supplied Linux container                    |
| Package manager     | pnpm 11.19.0                                                      |
| Database            | PostgreSQL 18, UTF-8, protected network connectivity              |
| App port            | 3000 by default; container binds 0.0.0.0 internally               |
| Public origin       | `APP_URL`, exact HTTPS origin for CSRF enforcement                |
| Public URL metadata | `PUBLIC_SITE_URL`, supplied at runtime                            |
| Database secret     | `DATABASE_URL`, provided at runtime through the host secret store |
| Liveness            | `GET /api/health`                                                 |
| Readiness           | `GET /api/ready`, includes database reachability                  |

The suggested domains are `ruvora.com`, `app.ruvora.com`, and `dev.ruvora.com`. Configure them through environment and routing; do not embed them in financial logic. A single application origin serves all surfaces in this first deployment shape. Distinct marketing/app hosts require explicit routing and canonical URL configuration.

Server-only variables are runtime configuration. Set PUBLIC_SITE_URL for this application's metadata. NEXT_PUBLIC_APP_URL is reserved build-time configuration and is not currently consumed by application components. Any future Next.js public variables will be embedded during the build. See the official [Next.js environment guide](https://nextjs.org/docs/app/guides/environment-variables) and [standalone output documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

## Clean deployment sequence

1. Use the canonical `https://github.com/david44220/ruvora` repository. Require successful CI and review before integrating feature branches into `develop` or `main`. See RELEASE_REPORT.md for the initial branch and PR.
2. Provision separate staging and production PostgreSQL databases with separate credentials. Production must never share the test database or local volumes.
3. Provision secrets and HTTPS termination. Set `APP_URL` to the exact user-facing application origin, `PUBLIC_SITE_URL` for canonical/share URLs, `APP_ENV=production`, and the matching `NEXT_PUBLIC_APP_URL` build default.
4. Set `ALLOW_DEV_SEED=false` and `ALLOW_DEMO_FUNDING=false`; omit `DEMO_PASSWORD`. The separate first-admin bootstrap creates no demo data or financial defaults; follow the maintenance sequence below.
5. Run the documented CI checks against isolated PostgreSQL.
6. Build an immutable application image and migration image from the same commit:
   ```sh
   docker build --target runner --build-arg NEXT_PUBLIC_APP_URL=https://app.ruvora.com -t ruvora:COMMIT .
   docker build --target migration --build-arg NEXT_PUBLIC_APP_URL=https://app.ruvora.com -t ruvora-migrate:COMMIT .
   ```
7. Take and verify a database backup before any release that changes persistent data.
8. Run one migration job with `DATABASE_URL` from the secret store. Its default command is `pnpm db:migrate`. Do not run migrations independently from every application replica.
9. Start the app image with production runtime variables. Route traffic only after readiness succeeds.
10. Exercise login, role denial, public profile, event and non-monetary read paths in staging, then approve production traffic.

A host that builds from source can instead run `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm build`, then `pnpm start`. The built container uses `node server.js`, copies static/public assets explicitly, and runs as the unprivileged `node` user.

## First administrator and policy initialization

After migrations, use the migration/tooling image or a trusted checkout to run `pnpm exec tsx scripts/bootstrap-admin.ts`. Supply `DATABASE_URL`, `ALLOW_ADMIN_BOOTSTRAP=true`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` through the operator's secret mechanism. The password must be at least 16 characters. Never put the password in a shell command line or a checked-in file.

The script creates only the first administrator and its audit event. It refuses to overwrite/elevate an existing account and refuses when any administrator already exists. It does not seed economic rules, demo data or funds. Remove the bootstrap permission/password variables after successful provisioning.

A clean database is intentionally not ready until economic policy is configured. Start a maintenance application instance reachable only by the operator, complete the admin's onboarding, and create an explicit versioned rule set through the admin API/interface. Keep public traffic disabled during this process; readiness must not be weakened to make initial configuration easier. Document and review the chosen eligibility, RU, pool, liabilities and Margin Governor values. Confirm readiness and operator access before attaching public traffic.

This initial bootstrap is implemented; its execution on the target Abacus environment, MFA, credential recovery and incident access procedures remain to be verified.

## PostgreSQL and persistence

The local Compose file is a development convenience, not an Internet-facing production database topology. Its port publishes to loopback. Production should use a managed or independently operated PostgreSQL instance with restricted network access, encrypted transport as required by the provider, least-privilege application access, backup retention, restore drills, and monitoring.

PostgreSQL 18 container volumes mount at `/var/lib/postgresql`; the image stores its cluster in a version-specific subdirectory. Preserve this path for upgrades. See the official [PostgreSQL container documentation](https://hub.docker.com/_/postgres).

Prisma migrations are committed forward changes. Development authors use `prisma migrate dev` against an expendable development database, review the generated SQL, and commit it. Production runs only `prisma migrate deploy`. Never use `db push`, migration resets or automatic drop/recreate against production. Separate owner/migration credentials from runtime credentials when operational controls support this. Schema ownership and ledger triggers require explicit migration privilege planning.

Backups must include the database, schema, rules, ledger, distribution snapshots and audit data. Restore into a separate environment, run readiness and reconciliation checks, and record the outcome. A backup without a successful restore drill is not a completed recovery plan. Document RPO/RTO and data retention before handling real funds.

## Rollback and operation

Promote a versioned image by commit or digest; keep the prior image available. Use backward-compatible expand/migrate/contract schema changes. If a release fails after a schema migration, stop traffic to the affected capability and prefer a reviewed forward fix. Do not blindly reverse an accounting migration or rewrite finalized economics. A restore may discard post-backup activity and requires explicit incident approval and reconciliation.

Log request/correlation IDs and domain operation IDs; redact passwords, sessions, connection strings and personal data. Monitor readiness failures, database saturation, request error rates, validation backlog, rejected activity, economic holds, ledger reconciliation and distribution failures. Configure alert ownership before launch.

## Launch gates

- Implement and validate transactional email verification and password recovery; no mail transport is currently connected.
- Verify the one-time administrator bootstrap in the target environment; require stronger administrator authentication and account recovery.
- Complete provider selection, signed/idempotent payment webhooks, payout controls, refund/chargeback handling, and reconciliation before live money flows.
- Review actual jurisdiction, age, geo, KYC/KYB, tax, privacy and prize policies. Configuration is not a legal certification.
- Verify campaign evidence, anti-abuse operations, rate-limit retention and edge abuse protection under realistic traffic.
- Validate backups/restores, TLS/proxy origin behavior, secrets rotation, incident response and least-privilege access.
- Run container and database migration smoke tests in the target Linux environment, then load, security and accessibility acceptance tests.

Docker is not installed in the initial Windows build environment. The Dockerfile and Compose configuration were authored, but image build/boot and Abacus deployment must not be described as executed unless the release report records that evidence.
