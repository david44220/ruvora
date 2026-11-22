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
4. **Immutable finalized history:** Finalized distributions, settled events, ledger journals, and reviewed approval states are protected by PostgreSQL triggers (8 forward migrations under `prisma/migrations/`, verified via `node scripts/verify-migrations.mjs`). Corrections require explicit audited compensating entries, never silent edits or deletes.
5. **Margin Governor & Event Prize isolation:** Campaign escrow, advertiser available funds, `EVENT_PRIZE` reserves, `GLOBAL_DISTRIBUTION_POOL`, and `platform:revenue` are distinct ledger buckets. Only uncovered event prize shortfalls reduce Global Distribution Pool capacity.
6. **Trusted attribution & direct bounded referrals:** Server-owned opaque `ShareLink` slugs and `HttpOnly` `AttributionContext` / visitor cookies (`FIRST_ELIGIBLE_CREATOR`). Single-level direct referrals only, capped per activity and per referrer period; registration alone creates zero RU or money.
7. **Bilingual EN/FR UI contract:** Every UI string lives in `src/i18n/messages.ts`, `src/i18n/pass02.ts`, `src/i18n/pass04.ts`, and `src/i18n/errors.ts` with strict key parity enforced by `tests/unit/i18n.test.ts`. User-authored names, bios, URLs, creative briefs, and campaign/event texts are never auto-translated.
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
- Before launching `pnpm dev` right after `pnpm build`, clear `.next` (`rm -rf .next && pnpm dev`) so Turbopack HMR does not loop against production artifacts.

---

## 4. Architecture Map

- **`src/domains/economy/`:** Pure deterministic financial core (`activity.ts`, `attribution.ts`, `distribution.ts`, `event-settlement.ts`, `events.ts`, `ledger.ts`, `margin.ts`, `referrals.ts`, `reward-units.ts`, `shared.ts`) + `src/domains/policy/index.ts`. Zero DB or network side effects.
- **`src/server/`:** Transactional orchestration (`api.ts`, `auth.ts`, `db.ts`, `profiles.ts`, `campaigns.ts`, `campaign-eligibility.ts`, `activities.ts`, `events.ts`, `event-settlement.ts`, `distributions.ts`, `attribution.ts`, `referrals.ts`, `analytics.ts`, `views.ts`, `ledger.ts`, `rules.ts`, `webhooks.ts`, `validation.ts`, `environment.ts`, `share-card.tsx`, plus Pass 04 modules: `risk.ts`, `quests.ts`, `notifications.ts`, `audience-verify.ts`, `promo-codes.ts`, `integrations.ts`, `export.ts`).
- **`src/server/security/`:** `password.ts` (`scrypt2`), `totp.ts` (RFC 6238), `mfa.ts` (enrollment, step-up, recovery, `requireFreshMfa`, `requireAdminMfaSession`), `crypto.ts` (AES-256-GCM record-bound secret boxes), `email.ts` (verification/reset tokens + encrypted `MailOutbox`), `approvals.ts` (dual-control `FinancialApproval`), `webhook-signature.ts`.
- **`src/server/providers/`:** Explicit development-simulated payment, email, and conversion ports (`payments.ts`, `email.ts`, `conversions.ts`).
- **`src/components/`:** Modular React client surfaces (`landing.tsx`, `public-pages.tsx`, `auth.tsx`, `dashboard.tsx`, `campaigns.tsx`, `event-studio.tsx`, `growth.tsx`, `profile-editor.tsx`, `profile-modules.tsx`, `security.tsx`, `admin.tsx`, `admin-pass02.tsx`, `ui.tsx`, `workspace-ui.tsx`, plus Pass 04 surfaces: `notifications-bell.tsx`, `pass04-creator.tsx`, `pass04-advertiser.tsx`).
- **`src/lib/`:** Client API & lossless formatters (`api.ts`), hooks (`hooks.ts`), safe navigation (`navigation.ts`), share recovery (`share-recovery.ts`), local zero-dependency ISO/IEC 18004 QR Code SVG encoder (`qr.ts`), types (`types.ts`).
- **`scripts/`:** `configure-development.mjs`, `local-postgres.mjs`, `seed.ts`, `bootstrap-admin.ts`, `provision-admin.ts`, `process-outboxes.ts`, `inspect-dev-mail.ts`, `optimize-assets.mjs`, `verify-migrations.mjs`.

---

## 5. Implementation Status (Pass 01 → Pass 02 → Pass 03 → Pass 04)

- **Pass 01 (Foundation, `cbd762a`):** Core modular monolith, identity/onboarding, public Ruvora Links, campaigns, validated activities, immutable balanced ledger, Margin Governor, versioned economic rules, canonical artwork, EN/FR i18n.
- **Pass 02 (Attribution & Sponsored Events, merged to `develop` at `d93608b` via PR #2):** Server-issued opaque attribution, direct bounded referrals, creator/advertiser/admin growth analytics, customizable public profile modules, sponsored events with segregated `EVENT_PRIZE` reserves, deterministic frozen settlement with two-person MFA approval, TOTP MFA + recovery codes, encrypted `MailOutbox`, signed durable webhook inbox, and 4 forward migrations.
- **Pass 03 (Security, UX, i18n & Performance Hardening, branch `feature/pass-03-security-ux-hardening`, `494bbd2`):**
  - **Dependency & Transport Security:** Patched production dependencies to **0 vulnerabilities** (`Next.js 16.4.6`, `Zod 4.6.7`, `Sharp 0.35.5`, `Prisma 7.10.1`, `Vitest 5.1.1`), added CI `pnpm audit --prod --audit-level=high`, added production HSTS, conditional `Secure` flag on `ruvora_locale`, and `__Host-ruvora_session` outside development.
  - **Auth, SSRF, Governance & UX Polish:** `scrypt2` password hashing + authenticated password change, SSRF-hardened `safeUrl`, IP-bucket rate limiting, fresh MFA across all admin reviews, transactional dual-approval (`consumeApproval`) across distributions/rules/reversals/holds, `pnpm admin:provision`, batched `groupBy` N+1 fixes, campaign `PAUSE`/`RESUME`, local SVG TOTP QR code, live EUR/bps previews, Admin MFA banner, Distribution Preview breakdown table, Validated Activities reversal UI, and FR/EN polish.
- **Pass 04 (Universal Monetization & Self-Serve Advertising Platform, branch `feature/pass-04-universal-monetization-ad-platform`, forward migration `202611220008_pass04_universal_platform`):**
  - **Pillar A — Everyone / Small-Account Monetization (10+ followers):**
    - Lightweight bio-code audience verification (`POST /api/profile/audience/begin` & `/confirm`, honest provenance `BIO_CODE_CHALLENGE` / `BIO_CODE_CHALLENGE_DEV`, `VERIFIED` badge preserved across profile edits unless followers increase above verified count).
    - Auto-Monetize Ruvora Link toggle (`User.autoMonetize`) + 4 curated Luxury Warm Futurism public profile themes (`obsidian`, `champagne`, `emerald-dusk`, `amber-glow`) + city & language profile metadata.
    - Personal Creator Promo Codes (`PromoCode` table, `GET/POST /api/promo-codes`) + inline local SVG QR Code (`src/lib/qr.ts`) on Opportunities, Creator Studio, and `/@handle`.
    - Creator Reliability Score (`0–100%`) & Trust Tiers (`EXPLORER` / `TRUSTED` / `AMBASSADOR`) + idempotent **XP-only** Progression Quests (`QuestClaim`, `GET /api/quests`, `POST /api/quests/claim`, zero Money/RU impact).
    - Wallet Cycle Transparency panel (€5.00 target micro-payout readiness banner with honest `PAYOUT_UNAVAILABLE` rail status) + formula-safe RFC 4180 CSV ledger export (`GET /api/wallet/export`).
  - **Pillar B — Universal Advertiser Targeting & Promotion Platform:**
    - Multi-criteria universal targeting (`deliveryMode`: `OPEN` | `UGC_BRIEF`, `maximumCreatorFollowers`, `allowedCities`, `allowedLanguages`, `allowedPlatforms`, `requireVerifiedAudience`, `minimumReliabilityScore`), structured `creativeBrief` kits, and HTTPS `abVariants` destination testing.
    - Live Addressable Audience Estimator (`POST /api/campaigns/estimate`) querying real onboarded accounts/creators and computing max budget-covered actions.
    - Pro Advertiser ROI Analytics (`eCPC`, `CPA`, daily actions chart, country/platform/A-B variant breakdowns) + formula-safe CSV export (`GET /api/analytics/advertiser/export`).
    - Conversion & Webhook Integration Hub (`AdvertiserIntegration`, AES-256-GCM encrypted per-advertiser signing key with one-time rotation reveal, Shopify/Stripe/Zapier/WooCommerce/Webflow snippets, dev-gated HMAC callback tester) + Agency/Team Workspaces (`WorkspaceMember`: `CAMPAIGN_MANAGER`, `BILLING`, `VIEWER`).
  - **Pillar C — Scalable Trust, Risk Engine, Smart Discovery & Notifications:**
    - Real server-side Activity Risk Engine (`src/server/risk.ts`) computing & persisting `riskScore` (`0–100`) and `riskSignals`, surfaced on Admin review cards alongside signed webhook conversion indicators (`ProviderConversion`).
    - Smart Opportunity Discovery sorting (`campaignRelevanceScore`) + budget availability meter + delivery mode badges.
    - Persistent In-App Notifications (`Notification` table, `GET /api/notifications`, `POST /api/notifications/read`) with accessible topbar bell drawer for validation/rejection/reversal, campaign review/low-budget (<20%), audience verification, quest claims, workspace invites, and finalized distributions.

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

### Verified checks on `feature/pass-04-universal-monetization-ad-platform` (2026-11-22)

- `node scripts/verify-migrations.mjs` — **PASS** (`cleanMigrations: 8`, `upgradeMigrations: 8`, `exactEconomicHistoryPreserved: true`)
- `pnpm format:check` — **PASS**
- `pnpm lint` (`eslint . --max-warnings 0`) — **PASS (0 warnings, 0 errors)**
- `pnpm typecheck` (`prisma generate && next typegen && tsc --noEmit`) — **PASS**
- `pnpm audit --prod --audit-level=high` — **PASS (0 production vulnerabilities)**
- `pnpm test` (Vitest unit) — **14/14 files, 274/274 tests PASS**
- `pnpm test:integration` (isolated PostgreSQL 18.4 `ruvora_test`) — **7/7 files, 82/82 tests PASS**
- `pnpm build` (Next.js 16.4.6 Turbopack standalone) — **PASS**
- `pnpm worker:once` — **PASS**
- Official Playwright E2E suite (`tests/e2e/*.spec.ts` in Chrome 158) — **20/20 PASS** (0 retries, 0 regressions)
- Pass 04 French interactive live browser verification — **18/18 checks PASS**, 0px overflow at 390px mobile, 13 live screenshots visually inspected with zero leaked secrets/keys/recovery codes.

---

## 7. Remaining Launch Gates (Do Not Claim Production Readiness Before Completion)

1. **External live providers:** Connect and contract-test real email transport (SMTP/API), real payment/escrow/refund/chargeback processor, real payout provider, and externally verified audience/conversion integrations.
2. **CSP tightening:** Migrate from `unsafe-inline` script/style directives to nonce-based strict CSP.
3. **Target infrastructure & containers:** Execute Docker image build/boot (`runner` and `migration` targets), Abacus deployment smoke tests, HTTPS/reverse-proxy cookie/origin validation, scheduled `pnpm worker:once` monitoring/alerting, and database backup + restore drills.
4. **Compliance & data governance:** Complete jurisdictional, tax, KYC/KYB, age/geo, and GDPR export/deletion procedures (preserving immutable accounting history), plus load testing and independent penetration testing.
5. **Testing rules:** Keep new tests strictly under `tests/**/*.test.ts`; run integration suites sequentially against an explicit `*_test` database; never capture screenshots/traces while TOTP secrets or recovery codes are rendered; never reset TOTP replay counters to pass tests.
