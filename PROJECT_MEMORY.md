# Ruvora — Project Memory

> **Source of operational truth for engineering sessions.** Read this file together with [AGENTS.md](AGENTS.md) before major changes. Consult domain references before editing regulated/economic surfaces: [ECONOMY.md](ECONOMY.md), [RU_ENGINE.md](RU_ENGINE.md), [LEDGER.md](LEDGER.md), [MARGIN_GOVERNOR.md](MARGIN_GOVERNOR.md), [ATTRIBUTION_ENGINE.md](ATTRIBUTION_ENGINE.md), [EVENT_SETTLEMENT.md](EVENT_SETTLEMENT.md), [SECURITY.md](SECURITY.md), [I18N.md](I18N.md), and [VISUAL_ASSET_MANIFEST.md](VISUAL_ASSET_MANIFEST.md). Original brief: [docs/MASTER_BUILD_BRIEF.md](docs/MASTER_BUILD_BRIEF.md).

---

## 1. Product Purpose & Core Identity

Ruvora is an independent creator economy platform unifying **public Ruvora Links** (`/@handle`), **reviewed advertising opportunities**, **community & sponsored events**, **long-term progression**, and **sustainable revenue sharing**.

- Initial creator monetization threshold is configurable (default development setting: 10 self-declared followers).
- Participation **never guarantees income**; earnings depend exclusively on eligible, independently validated, billable activity and Margin Governor affordability.
- Visual identity: **Luxury Warm Futurism** — obsidian (`#0b0a09`), warm ivory (`#f4f0e8`), champagne/amber (`#edbd89`), subtle borders (`rgba(240,220,193,.13)`). Three canonical raster masters live in `assets/masters/` (`ruvora-flagship.png`, `ruvora-orb.png`, `ruvora-event.png`) with WebP/PNG delivery derivatives under `public/assets/`. Never substitute generic stock/procedural spheres or claim an unverified image-model version (see [VISUAL_ASSET_MANIFEST.md](VISUAL_ASSET_MANIFEST.md)).

---

## 2. Non-Negotiable Architectural & Economic Invariants

1. **Modular monolith, server-authoritative:** Roles (`USER`, `CREATOR`, `ADVERTISER`, `ADMIN`), ownership, eligibility, and policy checks live strictly on the server (`src/server/*`, `src/domains/*`). Public signup can never grant `ADMIN` or accept forged creator attribution.
2. **Four permanently separate value systems:**
   - **Money:** Exact `bigint` EUR minor units (100 = €1.00), derived strictly from the append-only balanced ledger (`LedgerTransaction` / `LedgerEntry`). Never mutate balances directly.
   - **Reward Units (RU):** Exact `bigint` micro-units (`1 RU = 1,000,000 micros`) partitioned by category (`USER`, `CREATOR`, `ADVERTISER`, `REFERRAL`). Not currency, crypto, or an investment; no fixed cash conversion rate.
   - **XP:** Nonnegative integer long-term progression (`XpEntry` + idempotent `QuestClaim`). Never converts to money or RU.
   - **Event Points:** Event-scoped integer leaderboard scores (`EventPoint`). Never converts to money.
3. **Zero RU on deposit / funding:** Deposits, campaign funding, and event prize reservations never mint final RU. Advertiser RU follows independently validated, billable campaign delivery only.
4. **Immutable finalized history:** Finalized distributions, settled events, ledger journals, rejected activities (`ruvora_guard_activity`), and reviewed approval states are protected by PostgreSQL triggers (9 forward migrations under `prisma/migrations/`, verified via `node scripts/verify-migrations.mjs`). Corrections require explicit audited compensating entries (e.g., `PAYOUT_REFUND`, linked compensating `Activity` on overturned appeals), never silent edits or deletes.
5. **Margin Governor & Event Prize isolation:** Campaign escrow, advertiser available funds, `EVENT_PRIZE` reserves, `PAYOUT_PENDING` / `PAYOUT_SETTLED`, `GLOBAL_DISTRIBUTION_POOL`, and `platform:revenue` are distinct ledger buckets. Only uncovered event prize shortfalls reduce Global Distribution Pool capacity.
6. **Trusted attribution & direct bounded referrals:** Server-owned opaque `ShareLink` slugs and `HttpOnly` `AttributionContext` / visitor cookies (`FIRST_ELIGIBLE_CREATOR`) with deterministic weighted A/B destination split-testing (`abVariantId`). Single-level direct referrals only, capped per activity and per referrer period; registration alone creates zero RU or money.
7. **Bilingual EN/FR UI contract:** Every UI string lives in `src/i18n/messages.ts`, `src/i18n/pass02.ts`, `src/i18n/pass04.ts`, `src/i18n/pass05.ts`, and `src/i18n/errors.ts` with strict key parity enforced by `tests/unit/i18n.test.ts` and `tests/unit/pass05.test.ts`. User-authored names, bios, URLs, creative briefs, UGC pitches, and campaign/event texts are never auto-translated.
8. **Git & Branching discipline:** Canonical repository is `david44220/ruvora`. Work on dedicated `feature/*` branches targeting `develop`; require reviewed green CI before merging/promoting.

---

## 3. Verified Technical Stack & Runtime Constraints

| Layer           | Version / Configuration                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Framework       | Next.js `16.4.6` (App Router, Turbopack, `src/proxy.ts` per-request nonce CSP, standalone)       |
| Database & ORM  | PostgreSQL `18.4` (`127.0.0.1:54329` locally), Prisma `7.10.1` + `@prisma/adapter-pg` (tuned)    |
| Validation      | Zod `4.6.7` (strict request schemas, SSRF-hardened `safeUrl`, magic-byte image verification)     |
| Styling & Icons | Tailwind CSS `4.3.3`, modular CSS (`src/app/globals.css` → `src/app/styles/01..05*.css`), Lucide |
| Media & PDF     | Sharp `0.35.5` (canonical WebP/PNG delivery derivatives), zero-dependency PDF 1.4 (`pdf.ts`)     |
| Testing         | Vitest `5.1.1` (unit & PostgreSQL integration), Playwright `1.63.0` (Chromium/Chrome)            |
| Package Manager | `pnpm@11.19.0`, target Node.js `24 LTS` (dev VM verified on Node `22.23.5` with warning)         |

**Supply-chain overrides (`pnpm-workspace.yaml`):**

- `source-map-js: ">=1.2.4"`, `fast-uri: ">=3.1.9"`, `effect: ">=3.22.1 <4"` (**keep `<4` constraint** so `@prisma/config@7.10.1` stays on `effect` v3 instead of breaking v4).
- Production dependency security audit (`pnpm audit --prod`): **0 vulnerabilities** (`0 critical, 0 high, 0 moderate, 0 low, 0 info`). Enforced in CI via `pnpm audit --prod --audit-level=high`.

**Known runtime note:**

- `pg` + `@prisma/adapter-pg` currently emits a Node `DeprecationWarning` regarding concurrent `client.query()` calls; monitor when upgrading toward `pg@9.0`.
- Before launching `pnpm dev` right after `pnpm build`, clear `.next` (`rm -rf .next && pnpm dev`) so Turbopack HMR does not loop against production artifacts.

---

## 4. Architecture Map

- **`src/proxy.ts`:** Next.js 16 request proxy applying per-request 128-bit cryptographic CSP nonces (`script-src 'self' 'nonce-...' 'strict-dynamic'`, removing `'unsafe-inline'` from `script-src`) and isolating `/embed/*` (`frame-ancestors *` without `X-Frame-Options: DENY`).
- **`src/domains/economy/`:** Pure deterministic financial core (`activity.ts`, `attribution.ts`, `distribution.ts`, `event-settlement.ts`, `events.ts`, `ledger.ts`, `margin.ts`, `referrals.ts`, `reward-units.ts`, `shared.ts`) + `src/domains/policy/index.ts`. Zero DB or network side effects.
- **`src/server/`:** Transactional orchestration (`api.ts`, `auth.ts`, `db.ts`, `logger.ts`, `workspaces.ts`, `profiles.ts`, `campaigns.ts`, `campaign-eligibility.ts`, `activities.ts`, `events.ts`, `event-settlement.ts`, `distributions.ts`, `attribution.ts`, `referrals.ts`, `analytics.ts`, `views.ts`, `ledger.ts`, `rules.ts`, `webhooks.ts`, `validation.ts`, `environment.ts`, `share-card.tsx`, Pass 04 modules: `risk.ts`, `quests.ts`, `notifications.ts`, `audience-verify.ts`, `promo-codes.ts`, `integrations.ts`, `export.ts`, and Pass 05 modules: `payouts.ts`, `disputes.ts`, `evidence.ts`, `directory-ugc.ts`, `pdf.ts`, `gdpr.ts`).
- **`src/server/security/`:** `password.ts` (`scrypt2`), `totp.ts` (RFC 6238), `mfa.ts` (enrollment, step-up, recovery, `requireFreshMfa`, `requireAdminMfaSession`), `passkeys.ts` (WebAuthn ES256/RS256 SPKI + RP/origin + monotonic `signCount`), `crypto.ts` (AES-256-GCM record-bound secret boxes), `email.ts` (verification/reset tokens + encrypted `MailOutbox`), `approvals.ts` (dual-control `FinancialApproval`), `webhook-signature.ts`.
- **`src/server/providers/`:** Explicit development-simulated payment, email, and conversion ports (`payments.ts`, `email.ts`, `conversions.ts`) plus zero-dependency production-structured Stripe Checkout / HMAC and Resend adapters (`adapters.ts`).
- **`src/components/`:** Modular React client surfaces (`landing.tsx`, `public-pages.tsx`, `auth.tsx`, `dashboard.tsx`, `campaigns.tsx`, `event-studio.tsx`, `growth.tsx`, `profile-editor.tsx`, `profile-modules.tsx`, `security.tsx`, `admin.tsx`, `admin-pass02.tsx`, `ui.tsx`, `workspace-ui.tsx`, Pass 04: `notifications-bell.tsx`, `pass04-creator.tsx`, `pass04-advertiser.tsx`, and Pass 05: `pass05-creator.tsx`, `pass05-advertiser.tsx`, `pass05-security-admin.tsx`).
- **`src/lib/`:** Client API & lossless formatters (`api.ts`), deduplicated hooks (`hooks.ts`), safe navigation (`navigation.ts`), share recovery (`share-recovery.ts`), local zero-dependency ISO/IEC 18004 QR Code SVG encoder (`qr.ts`), types (`types.ts`).
- **`scripts/`:** `configure-development.mjs`, `local-postgres.mjs`, `seed.ts`, `bootstrap-admin.ts`, `provision-admin.ts`, `process-outboxes.ts` (advisory-locked), `inspect-dev-mail.ts`, `optimize-assets.mjs`, `verify-migrations.mjs`.

---

## 5. Implementation Status (Pass 01 → Pass 02 → Pass 03 → Pass 04 → Pass 05)

- **Pass 01 (Foundation, `cbd762a`):** Core modular monolith, identity/onboarding, public Ruvora Links, campaigns, validated activities, immutable balanced ledger, Margin Governor, versioned economic rules, canonical artwork, EN/FR i18n.
- **Pass 02 (Attribution & Sponsored Events, merged to `develop` at `d93608b` via PR #2):** Server-issued opaque attribution, direct bounded referrals, creator/advertiser/admin growth analytics, customizable public profile modules, sponsored events with segregated `EVENT_PRIZE` reserves, deterministic frozen settlement with two-person MFA approval, TOTP MFA + recovery codes, encrypted `MailOutbox`, signed durable webhook inbox, and 4 forward migrations.
- **Pass 03 & Pass 04 (Merged to `develop` at `e73bc2d` via PR #3):**
  - **Pass 03:** 0 prod dependency vulnerabilities, production HSTS, `__Host-ruvora_session`, `scrypt2`, SSRF-hardened `safeUrl`, IP-bucket rate limiting, fresh MFA on all admin reviews, transactional dual-approval (`consumeApproval`), `pnpm admin:provision`, batched `groupBy` N+1 fixes, campaign `PAUSE`/`RESUME`, local SVG TOTP QR code, FR/EN & mobile polish.
  - **Pass 04 (`202611220008_pass04_universal_platform`):** Bio-code audience verification, Auto-Monetize toggle, 4 Luxury Warm Futurism profile themes, personal promo codes + QR, Reliability Score & Trust Tiers, XP-only progression quests, CSV ledger exports, universal multi-criteria targeting, Live Addressable Audience Estimator, Pro ROI Analytics, Conversion Webhook Hub, Agency `WorkspaceMember`, server Activity Risk Engine, relevance-ranked Opportunities, and persistent Notifications.
- **Pass 05 (Platform Completeness & Architecture Hardening, branch `feature/pass-05-platform-completeness`, forward migration `202611220009_pass05_platform_completeness`):**
  - **Technical & Security Hardening:** Next.js 16 strict per-request nonce CSP (`src/proxy.ts`), tuned PostgreSQL pool + jittered exponential retry backoff + worker advisory lock (`src/server/db.ts`, `scripts/process-outboxes.ts`), structured JSON logging with secret redaction (`src/server/logger.ts`), live readiness probe (`GET /api/ready`), cursor pagination & batched streaming CSV (`streamWalletCsv`), 5-module CSS split (`src/app/styles/`), deduplicated `useResource`, real-time SSE notifications (`GET /api/notifications/stream`), WebAuthn Passkeys (`src/server/security/passkeys.ts`), GDPR Article 20 JSON export & Article 17 ledger-preserving PII anonymization (`src/server/gdpr.ts`), and zero-dependency Stripe/Resend production adapters (`src/server/providers/adapters.ts`, `src/server/providers/email.ts`).
  - **End-to-End Wiring of Pass 04:** Multi-workspace Agency RBAC (`src/server/workspaces.ts` + `WorkspaceSwitcherBar`), per-advertiser dedicated HMAC webhook key resolution with 24h rotation grace window (`integrations.ts`, `webhooks.ts`), deterministic weighted A/B split-testing on `/go/[slug]` attribution (`attribution.ts`, `activities.ts`), and SSRF-hardened optional live bio-code audience fetching with `AudienceVerificationSnapshot` audit history (`audience-verify.ts`).
  - **New High-Value Product Capabilities:** 2-phase immutable ledger Creator Payouts (`USER_PAYABLE → PAYOUT_PENDING → PAYOUT_SETTLED` / `PAYOUT_REFUND`, €5.00 min, encrypted destination, dual approval ≥ €100 / non-dev), Four-Eyes Activity Appeals (`disputes.ts`, preserving `ruvora_guard_activity()` immutability via linked compensating activities), magic-byte-verified Visual Evidence upload & sandboxed serving (`/api/evidence/upload`, `/api/evidence/[id]`), Opt-In Creator Discovery Directory + Direct Campaign Invitations + structured UGC Deliverables (`directory-ugc.ts`), per-creator campaign caps (`maxActivitiesPerCreator`) & 1-click campaign duplication (`POST /api/campaigns/:id/duplicate`), zero-dependency PDF 1.4 Advertiser Invoices (`/api/invoices/advertiser/[period]`) & Creator Statements (`/api/statements/creator/[period]`), and Embeddable Ruvora Link Widget (`/embed/[handle]`).

---

## 6. Operational Commands & Latest Verified Results

### Local development startup

```sh
pnpm dev:configure        # Generates private local .env secrets without printing them
pnpm db:local             # Starts loopback PostgreSQL 18.4 on 127.0.0.1:54329
pnpm db:generate
pnpm db:migrate
pnpm db:seed              # Seeds demo accounts (admin@ruvora.test, demo-admin-reviewer@ruvora.test, mira@ruvora.test, studio@ruvora.test, etc.)
pnpm dev                  # Starts Next.js dev server on http://localhost:3000
pnpm worker:once          # Processes mail/webhook outboxes under advisory lock, expires approvals, prunes rate limits
```

### Production admin provisioning (never run with demo flags)

```sh
ALLOW_ADMIN_BOOTSTRAP=true BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... pnpm admin:bootstrap
ALLOW_ADMIN_PROVISION=true PROVISION_ADMIN_EMAIL=... PROVISION_ADMIN_PASSWORD=... pnpm admin:provision
```

### Verified checks on `feature/pass-05-platform-completeness` (2026-11-22)

- `node scripts/verify-migrations.mjs` — **PASS** (`cleanMigrations: 9`, `upgradeMigrations: 9`, `exactEconomicHistoryPreserved: true`)
- `pnpm format:check` — **PASS**
- `pnpm lint` (`eslint . --max-warnings 0`) — **PASS (0 warnings, 0 errors)**
- `pnpm typecheck` (`prisma generate && next typegen && tsc --noEmit`) — **PASS**
- `pnpm audit --prod --audit-level=high` — **PASS (0 production vulnerabilities)**
- `APP_URL=http://localhost:3000 pnpm test` (Vitest unit) — **15/15 files, 284/284 tests PASS**
- `DATABASE_URL="$TEST_DATABASE_URL" pnpm test:integration` (isolated PostgreSQL 18.4 `ruvora_test`) — **8/8 files, 86/86 tests PASS**
- `pnpm build` (Next.js 16.4.6 Turbopack standalone + `src/proxy.ts`) — **PASS**
- `pnpm worker:once` (advisory-locked outbox processing) — **PASS**
- Official Playwright E2E suite (`tests/e2e/*.spec.ts` in Chrome 158 with strict nonce CSP) — **20/20 PASS** (0 retries, 0 regressions)
- Pass 05 French interactive live browser verification — **16/16 checks PASS**, `/api/ready` 200 (`migrationsApplied: 9`), strict nonce `script-src` verified, `/embed/mira` `frame-ancestors *` & 0px overflow verified, live SSE `text/event-stream`, PDF 1.4 invoices & statements (`%PDF-1.4`), GDPR JSON export (`ruvora-gdpr-v1`), 7 live screenshots visually inspected with zero leaked secrets/keys/recovery codes.

---

## 7. Remaining Launch Gates (Do Not Claim Production Readiness Before Completion)

1. **External live provider credentials & contract tests:** Configure and contract-test live `STRIPE_SECRET_KEY` / Stripe Connect payouts / chargeback webhooks, live `RESEND_API_KEY` + verified sender domain (`EMAIL_FROM`), S3-compatible object storage for evidence attachments, and externally audited audience/conversion integrations where required.
2. **Target infrastructure & containers:** Execute Docker image build/boot (`runner` and `migration` targets), Abacus/cloud deployment smoke tests, HTTPS/reverse-proxy cookie/origin validation, scheduled `pnpm worker:once` monitoring/alerting, and database backup + restore drills.
3. **Compliance, legal & security assurance:** Complete jurisdictional tax/VAT/invoicing legal review, real KYC/KYB verification vendor onboarding, age/geo controls, privacy/retention documentation, load testing, and an independent third-party penetration test.
4. **Testing rules:** Keep new tests strictly under `tests/**/*.test.ts`; run integration suites sequentially against an explicit `*_test` database; never capture screenshots/traces while TOTP secrets or recovery codes are rendered; never reset TOTP replay counters to pass tests.
