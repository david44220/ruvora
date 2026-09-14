# Testing and validation

Checks are split by responsibility. Unit tests exercise deterministic domain behavior without a database. Integration tests exercise real PostgreSQL persistence, authentication/authorization and API use cases. Browser tests exercise rendered user journeys.

A passing unit suite does not prove transaction safety. A passing build does not prove that Docker boots or that the user interface was inspected. Record exact executed commands and results in [RELEASE_REPORT.md](RELEASE_REPORT.md).

## Commands

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Use the package scripts as the authority. Typecheck generates Prisma and Next route types before TypeScript. Build generates the Prisma client before Next compiles.

## Test database isolation

Never run integration setup or cleanup against production or the development database you wish to preserve. Use the dedicated `ruvora_test` database. The local helper and fresh Compose volume create it. Tests must reject a database target that is not explicitly a test database before destructive fixture setup.

In a separate PowerShell terminal, with the local PostgreSQL helper running:

```powershell
$env:DATABASE_URL = 'postgresql://ruvora:ruvora-local-only@127.0.0.1:54329/ruvora_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:ALLOW_DEV_SEED = 'true'
$env:ALLOW_DEMO_FUNDING = 'true'
pnpm dev:configure # Generate missing private development settings without printing them.
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm test:integration
```

The corresponding POSIX setup uses `export DATABASE_URL='.../ruvora_test'` and `export TEST_DATABASE_URL="$DATABASE_URL"`. These shell variables apply only to that terminal; do not overwrite the development URL in your normal application terminal.

CI provisions a fresh PostgreSQL 18 service per integration job. It installs the lockfile, generates Prisma, applies committed migrations, seeds isolated fixtures and runs the integration suite. The quality job independently runs lint, typecheck, unit tests and production build. The canonical GitHub repository has executed this workflow successfully; RELEASE_REPORT.md links the verified run and exact results. Future commits must pass their own checks.

## Required financial and policy evidence

- Deposits or campaign funding create zero final RU.
- Only validated/billable activity creates eligible advertiser RU.
- Duplicate and concurrent submissions do not double-charge or double-reward.
- Budget and daily-cap enforcement remain correct at transaction boundaries.
- Rejection/reversal cannot manufacture value; finalized history cannot silently change.
- Ledger transactions balance in a single currency, with exact integer handling.
- Idempotency keys cannot be reused with a different economic payload.
- RU, XP and Event Points remain independent; event rankings use deterministic ties.
- Distribution preview/finalization uses versioned immutable inputs and exact rounding.
- Margin constraints account for configured liabilities, reserves and retained revenue.
- Referral rewards are bounded, direct and tied to eligible activity.
- Authorization, ownership, suspension and policy gates fail closed.

The suite should target these invariants, including failures and retries. Do not substitute tests that merely duplicate implementation statements.

## Browser acceptance

Run Playwright after installing its browser dependencies with `pnpm exec playwright install chromium` (Linux CI may use `--with-deps`). Use an isolated seeded database and the Playwright configuration's application origin.

Inspect homepage, Ruvora Link, user/creator/advertiser dashboards, event details and admin at mobile and desktop widths. Check EN/FR, keyboard access, visible focus, form error handling, reduced motion, text wrapping, image focal points, no horizontal overflow, console errors and network failures. Test login/logout, registration/onboarding, server-side role denial, campaign draft/funding/review, pending activity and independent validation. Development funding is available only in the development environment.

Full accessibility auditing, target-device testing, load testing, distributed concurrency testing and penetration testing are additional launch gates.

## Current recorded infrastructure evidence

During the initial local build, Node.js 24.18.0 and pnpm 11.19.0 were observed; native dependency rebuild completed; PostgreSQL 18.4 initialized and accepted connections only on `127.0.0.1:54329`; both development/test databases were created; the helper passed Node syntax checking.

Application checks, migration/seed checks, browser coverage and final counts are recorded by the lead implementation pass in [RELEASE_REPORT.md](RELEASE_REPORT.md). Docker is absent on this host, so container build/boot and Compose startup have not been executed here.

## Automated browser journeys

The Playwright suite uses Chromium with one worker and a local origin (`localhost` or `127.0.0.1`). It reads `DEMO_PASSWORD` from the local environment without writing it into test output. Browser traces and videos are disabled because traces can retain authentication payloads; failed page-fixture tests retain screenshots and a local HTML report.

The core scenario creates unique participant, creator and advertiser accounts through the rendered forms. It covers onboarding, creator profile publication and canonical URL, campaign draft/funding/submission, a separate seeded administrator's campaign approval, event joining, pending activity with zero rewards, independent evidence validation, exact user/advertiser RU and XP/Event Points separation, zero money before distribution, event leaderboard points, French persistence across reload/logout/login, and denial of administration to an ordinary user. Database assertions read the application's authenticated API after browser actions; the core mutations use visible forms.

Additional cases verify the homepage and seeded public profile at widths 360, 430, 768, 1024, 1440 and 1920, including image loading and document/body overflow. A seeded creator profile regression verifies that a bio-only save preserves both social profiles and both custom links, and that adding/removing a third row persists across reloads. That case restores only its own reversible edits. Other browser-created fixtures remain identifiable by their unique `e2e_` handles; the suite does not truncate or delete user data.

`pnpm test:e2e` starts a development server when none is running and reuses an existing local server outside CI. Confirm that an existing server points at the intended local database before running. CI starts its own server against its isolated PostgreSQL service. Use `E2E_BASE_URL` only for another local origin. The suite requires a seeded active `creator-rush` event and its linked campaign; refresh an isolated seed if its scheduled dates have expired. Automated browser tests complement, rather than replace, manual visual and accessibility review.

The administrator browser preview case submits a closed period, checks the visible pool and Margin Governor explanation, compares the rendered snapshot to the active distribution/margin rules, and verifies the persisted preview, fingerprint and audit entry after reload. It deliberately does not finalize the period. The event detail page also has a 390px overflow and image-loading check covering its leaderboard and rules.

## Pass 02 validation contract

Run `pnpm dev:configure` before seeding a fresh local checkout. It supplies private encryption, development callback and demo TOTP material. CI generates isolated security fixture secrets before seed; they are not live provider credentials. Full Vitest discovery is limited to `tests/**/*.test.ts`, so ignored local verification checkouts cannot enter the test suite.

The new database suites cover opaque attribution forgery/expiry/account binding, immutable snapshots, direct-referral caps/revocation, event reservation/freeze/reversal/finalization concurrency, independent media/admin approval, single-use recovery/TOTP replay, encrypted mail retries and signed duplicate provider callbacks. They keep immutable history and use unique fixture tags. The test database guard refuses the ordinary development database.

The creator browser journey verifies anonymous public-profile acquisition through actual HttpOnly cookies, signup/onboarding, campaign participation, independent validation, creator RU and analytics. The sponsored-event journey creates/reserves/reviews/activates an event, waits for its original end time, freezes rankings, exercises fresh MFA and two-person approval, settles once and checks public/mobile wallet results. Security browser journeys disable all screenshots/traces/videos while authenticator and recovery material is visible; their teardown removes sensitive transient DOM data.

Browser tests run with one worker. TOTP replay protection is global per credential, so tests either reuse an already-elevated session or wait for a new authenticator counter. Never reset a credential’s accepted counter to make tests pass. Event tests wait for their real approved end time; they never edit finalized dates/configuration.

A development database contains synthetic financial activity after browser tests. This is expected and labelled. Re-run only the failing scenario while fixing a defect; the final suite verifies the integrated state. Exact counts, migration upgrade evidence, fresh install, build and GitHub CI are recorded in RELEASE_REPORT.md.
