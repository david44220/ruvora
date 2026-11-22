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
   - **XP:** Nonnegative integer long-term progression (`XpEntry`). Never converts to money.
   - **Event Points:** Event-scoped integer leaderboard scores (`EventPoint`). Never converts to money.
3. **Zero RU on deposit / funding:** Deposits, campaign funding, and event prize reservations never mint final RU. Advertiser RU follows independently validated, billable campaign delivery only.
4. **Immutable finalized history:** Finalized distributions, settled events, ledger journals, and reviewed approval states are protected by PostgreSQL triggers (7 forward migrations under `prisma/migrations/`). Corrections require explicit audited compensating entries, never silent edits or deletes.
5. **Margin Governor & Event Prize isolation:** Campaign escrow, advertiser available funds, `EVENT_PRIZE` reserves, `GLOBAL_DISTRIBUTION_POOL`, and `platform:revenue` are distinct ledger buckets. Only uncovered event prize shortfalls reduce Global Distribution Pool capacity.
6. **Trusted attribution & direct bounded referrals:** Server-owned opaque `ShareLink` slugs and `HttpOnly` `AttributionContext` / visitor cookies (`FIRST_ELIGIBLE_CREATOR`). Single-level direct referrals only, capped per activity and per referrer period; registration alone creates zero RU or money.
7. **Bilingual EN/FR UI contract:** Every UI string lives in `src/i18n/messages.ts`, `src/i18n/pass02.ts`, and `src/i18n/errors.ts` with strict key parity enforced by `tests/unit/i18n.test.ts`. User-authored names, bios, URLs, and campaign/event texts are never auto-translated.
8. **Git & Branching discipline:** Canonical repository is `david44220/ruvora`. Work on dedicated `feature/*` branches targeting `develop`; require reviewed CI before promoting to `main`.

---

## 3. Verified Technical Stack & Runtime Constraints

| Layer           | Version / Configuration                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| Framework       | Next.js `16.4.6` (App Router, Turbopack, standalone output), React `19.3.0`, TypeScript  |
| Database & ORM  | PostgreSQL `18.4` (`127.0.0.1:54329` locally), Prisma `7.10.1` + `@prisma/adapter-pg`    |
| Validation      | Zod `4.6.7` (strict request schemas, SSRF-hardened `safeUrl`)                            |
| Styling & Icons | Tailwind CSS `4.3.3`, custom design tokens (`src/app/globals.css`), `lucide-react`       |
| Media           | Sharp `0.35.5` (canonical WebP/PNG delivery derivatives)                                 |
| Testing         | Vitest `5.1.1` (unit & PostgreSQL integration), Playwright `1.63.0` (Chromium/Chrome)    |
| Package Manager | `pnpm@11.19.0`, target Node.js `24 LTS` (dev VM verified on Node `22.23.5` with warning) |

**Supply-chain overrides (`pnpm-workspace.yaml`):**

- `source-map-js: ">=1.2.4"`, `fast-uri: ">=3.1.9"`, `effect: ">=3.22.1 <4"` (**keep `<4` constraint** so `@prisma/config@7.10.1` stays on `effect` v3 instead of breaking v4).
- Production dependency security audit (`pnpm audit --prod`): **0 vulnerabilities** (`0 critical, 0 high, 0 moderate, 0 low, 0 info`). Enforced in CI via `pnpm audit --prod --audit-level=high`.

**Known runtime note:**

- `pg` + `@prisma/adapter-pg` currently emits a Node `DeprecationWarning` regarding concurrent `client.query()` calls; monitor when upgrading toward `pg@9.0`.

---

## 4. Architecture Map

- **`src/domains/economy/`:** Pure deterministic financial core (`activity.ts`, `attribution.ts`, `distribution.ts`, `event-settlement.ts`, `events.ts`, `ledger.ts`, `margin.ts`, `referrals.ts`, `reward-units.ts`, `shared.ts`) + `src/domains/policy/index.ts`. Zero DB or network side effects.
- **`src/server/`:** Transactional orchestration (`api.ts`, `auth.ts`, `db.ts`, `profiles.ts`, `campaigns.ts`, `activities.ts`, `events.ts`, `event-settlement.ts`, `distributions.ts`, `attribution.ts`, `referrals.ts`, `analytics.ts`, `views.ts`, `ledger.ts`, `rules.ts`, `webhooks.ts`, `validation.ts`, `environment.ts`, `share-card.tsx`).
- **`src/server/security/`:** `password.ts` (`scrypt2`), `totp.ts` (RFC 6238), `mfa.ts` (enrollment, step-up, recovery, `requireFreshMfa`, `requireAdminMfaSession`), `crypto.ts` (AES-256-GCM record-bound secret boxes), `email.ts` (verification/reset tokens + encrypted `MailOutbox`), `approvals.ts` (dual-control `FinancialApproval`), `webhook-signature.ts`.
- **`src/server/providers/`:** Explicit development-simulated payment, email, and conversion ports (`payments.ts`, `email.ts`, `conversions.ts`).
- **`src/components/`:** Modular React client surfaces (`landing.tsx`, `public-pages.tsx`, `auth.tsx`, `dashboard.tsx`, `campaigns.tsx`, `event-studio.tsx`, `growth.tsx`, `profile-editor.tsx`, `profile-modules.tsx`, `security.tsx`, `admin.tsx`, `admin-pass02.tsx`, `ui.tsx`, `workspace-ui.tsx`).
- **`src/lib/`:** Client API & lossless formatters (`api.ts`), hooks (`hooks.ts`), safe navigation (`navigation.ts`), share recovery (`share-recovery.ts`), local zero-dependency ISO/IEC 18004 QR Code SVG encoder (`qr.ts`), types (`types.ts`).
- **`scripts/`:** `configure-development.mjs`, `local-postgres.mjs`, `seed.ts`, `bootstrap-admin.ts`, `provision-admin.ts`, `process-outboxes.ts`, `inspect-dev-mail.ts`, `optimize-assets.mjs`, `verify-migrations.mjs`.

---

## 5. Implementation Status (Pass 01 → Pass 02 → Pass 03)

- **Pass 01 (Foundation, `cbd762a`):** Core modular monolith, identity/onboarding, public Ruvora Links, campaigns, validated activities, immutable balanced ledger, Margin Governor, versioned economic rules, canonical artwork, EN/FR i18n.
- **Pass 02 (Attribution & Sponsored Events, merged to `develop` at `d93608b` via PR #2):** Server-issued opaque attribution, direct bounded referrals, creator/advertiser/admin growth analytics, customizable public profile modules, sponsored events with segregated `EVENT_PRIZE` reserves, deterministic frozen settlement with two-person MFA approval, TOTP MFA + recovery codes, encrypted `MailOutbox`, signed durable webhook inbox, and 4 forward migrations.
- **Pass 03 (Security, UX, i18n & Performance Hardening, branch `feature/pass-03-security-ux-hardening` targeting `develop`):**
  - **Dependency & Transport Security:** Patched production dependencies to **0 vulnerabilities** (`Next.js 16.4.6`, `Zod 4.6.7`, `Sharp 0.35.5`, `Prisma 7.10.1`, `Vitest 5.1.1`), added CI `pnpm audit --prod --audit-level=high`, added production HSTS (`max-age=63072000; includeSubDomains`), conditional `Secure` flag on `ruvora_locale` over HTTPS, and `__Host-ruvora_session` cookie naming outside development.
  - **Auth, SSRF & Abuse Hardening:** Upgraded password hashing to `scrypt2` (`N=32768, r=8, p=1`) with transparent login upgrade from legacy `scrypt$`; added authenticated password change (`POST /api/security/password/change`, revoking all other sessions); hardened `safeUrl` to reject `localhost`, loopback, link-local, RFC1918/CGNAT private IPs, and `.local`/`.internal` hosts; expanded reserved handles to 24 operational slugs; added IP-bucket rate limits across login, registration, password reset, `/go/[slug]`, `/share-card/*`, `/api/attribution/start`, and `/api/webhooks/*` with periodic cleanup (`pruneExpiredRateLimits`) in `pnpm worker:once`; anchored `/go/[slug]` redirects to canonical `APP_URL` outside dev/loopback.
  - **Admin MFA & Dual Approval Governance:** Extended `requireFreshMfa` (`<15 min`) to all admin campaign, activity, and event reviews in `src/server/api.ts`; added `requireAdminMfaSession` on `GET /api/admin*` outside development; integrated transactional `consumeApproval` into `commitDistribution` (`DISTRIBUTION_FINALIZE`), `updateEconomicRules` (`RULE_UPDATE`), `reverseActivity` (`FINANCIAL_REVERSAL`), and `setAccountHold` (`ACCOUNT_HOLD`) (enforced unconditionally outside development and verified whenever supplied in development); added audited second-admin provisioning CLI (`pnpm admin:provision`).
  - **Backend Performance & Campaign Lifecycle:** Replaced N+1 queries in `listCampaigns()` and `getDashboard()` with batched `groupBy` aggregations; added advertiser campaign `PAUSE`/`RESUME` (`POST /api/campaigns/:id/transition`).
  - **UX, Visual & EN/FR i18n Polish:** Fixed localized rules rendering on legacy seeded events (`public-pages.tsx`); localized root `<title>` and `<meta description>` via `generateMetadata()`; fixed 4 French dictionary/label mismatches (Wallet RU categories, Advertiser `Créateurs`, Admin `Partages d’événements`, Approvals `Actualiser`) and singular/plural day badges; added pure local SVG QR code for TOTP enrollment (`src/lib/qr.ts`), per-session revocation dropdown, Change Password panel, live EUR & basis-points percentage previews in Campaign/Event forms, Pause/Resume buttons, Admin fresh-MFA status banner, readable Distribution Preview breakdown table (preserving `.campaign-facts` and `pre.data-json`), Validated Activities reversal UI, Account Suspension control, Audit Trail filter, and clickable Approval selector; fixed mobile Hero contrast scrim, mobile Header CTA wrapping, Creator Studio bar width (`max-width: 56px`), and public profile share bar alignment (`width: min(100%, 490px)`).

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
pnpm worker:once          # Processes mail/webhook outboxes, expires approvals, prunes expired rate limits
```

### Production admin provisioning (never run with demo flags)

```sh
ALLOW_ADMIN_BOOTSTRAP=true BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... pnpm admin:bootstrap
ALLOW_ADMIN_PROVISION=true PROVISION_ADMIN_EMAIL=... PROVISION_ADMIN_PASSWORD=... pnpm admin:provision
```

### Verified checks on `feature/pass-03-security-ux-hardening` (2026-11-22)

- `pnpm format:check` — **PASS**
- `pnpm lint` (`eslint . --max-warnings 0`) — **PASS (0 warnings, 0 errors)**
- `pnpm typecheck` (`prisma generate && next typegen && tsc --noEmit`) — **PASS**
- `pnpm audit --prod --audit-level=high` — **PASS (0 production vulnerabilities)**
- `pnpm test` (Vitest unit) — **13/13 files, 265/265 tests PASS**
- `pnpm test:integration` (isolated PostgreSQL 18.4 `ruvora_test`) — **6/6 files, 77/77 tests PASS**
- `pnpm build` (Next.js 16.4.6 Turbopack standalone) — **PASS**
- `pnpm worker:once` — **PASS** (`expiredApprovals: 0, prunedRateLimits: 7`)
- Official Playwright E2E suite (`tests/e2e/*.spec.ts` in Chrome 158) — **20/20 PASS** (0 retries)
- Full function-by-function French browser test + visual inspection — **39/39 checks PASS**, 0 uncaught page errors, 18 screenshots visually inspected with zero leaked secrets/recovery codes.

---

## 7. Remaining Launch Gates (Do Not Claim Production Readiness Before Completion)

1. **External live providers:** Connect and contract-test real email transport (SMTP/API), real payment/escrow/refund/chargeback processor, real payout provider, and externally verified audience/conversion integrations.
2. **CSP tightening:** Migrate from `unsafe-inline` script/style directives to nonce-based strict CSP.
3. **Target infrastructure & containers:** Execute Docker image build/boot (`runner` and `migration` targets), Abacus deployment smoke tests, HTTPS/reverse-proxy cookie/origin validation, scheduled `pnpm worker:once` monitoring/alerting, and database backup + restore drills.
4. **Compliance & data governance:** Complete jurisdictional, tax, KYC/KYB, age/geo, and GDPR export/deletion procedures (preserving immutable accounting history), plus load testing and independent penetration testing.
5. **Testing rules:** Keep new tests strictly under `tests/**/*.test.ts`; run integration suites sequentially against an explicit `*_test` database; never capture screenshots/traces while TOTP secrets or recovery codes are rendered; never reset TOTP replay counters to pass tests.
