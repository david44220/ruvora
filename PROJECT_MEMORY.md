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
4. **Immutable finalized history:** Finalized distributions, settled events, ledger journals, rejected activities (`ruvora_guard_activity`), and reviewed approval states are protected by PostgreSQL triggers (13 forward migrations under `prisma/migrations/`, verified via `node scripts/verify-migrations.mjs`). Corrections require explicit audited compensating entries (e.g., `PAYOUT_REFUND`, linked compensating `Activity` on overturned appeals), never silent edits or deletes.
5. **Margin Governor & Event Prize isolation:** Campaign escrow, advertiser available funds, `EVENT_PRIZE` reserves, `PAYOUT_PENDING` / `PAYOUT_SETTLED`, `GLOBAL_DISTRIBUTION_POOL`, and `platform:revenue` are distinct ledger buckets. Only uncovered event prize shortfalls reduce Global Distribution Pool capacity.
6. **Trusted attribution & direct bounded referrals:** Server-owned opaque `ShareLink` slugs (plus optional owner-customizable kebab-case vanity slugs, mobile offer bridge `/go-card/[slug]`, and channel-tagged direct referrals `/r/[handle]?channel=...`) and `HttpOnly` `AttributionContext` / visitor cookies (`FIRST_ELIGIBLE_CREATOR`) with deterministic weighted A/B destination split-testing (`abVariantId`) and optional OS/locale Smart Routing (`Campaign.smartRouting`). Single-level direct referrals only, capped per activity and per referrer period; registration alone creates zero RU or money.
7. **Bilingual EN/FR UI contract:** Every UI string lives in `src/i18n/messages.ts`, `src/i18n/pass02.ts`, `src/i18n/pass04.ts`, `src/i18n/pass05.ts`, `src/i18n/pass06.ts`, `src/i18n/pass07.ts`, `src/i18n/pass08.ts`, `src/i18n/pass09.ts`, and `src/i18n/errors.ts` with strict key parity enforced by `tests/unit/i18n.test.ts` and `tests/unit/pass05..09.test.ts`. User-authored names, bios, URLs, creative briefs, collection notes, audience prompts, UGC pitches, and campaign/event texts are never auto-translated.
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
- **`src/app/manifest.ts`:** Next.js 16 Web App Manifest referencing canonical Sharp-derived PWA icons under `public/assets/pwa/`.
- **`src/domains/economy/`:** Pure deterministic financial core (`activity.ts`, `attribution.ts`, `distribution.ts`, `event-settlement.ts`, `events.ts`, `ledger.ts`, `margin.ts`, `referrals.ts`, `reward-units.ts`, `shared.ts`) + `src/domains/policy/index.ts`. Zero DB or network side effects.
- **`src/server/`:** Transactional orchestration (`api.ts`, `auth.ts`, `db.ts`, `logger.ts`, `workspaces.ts`, `profiles.ts`, `campaigns.ts`, `campaign-eligibility.ts`, `activities.ts`, `events.ts`, `event-settlement.ts`, `distributions.ts`, `attribution.ts`, `referrals.ts`, `analytics.ts`, `views.ts`, `ledger.ts`, `rules.ts`, `webhooks.ts`, `validation.ts`, `environment.ts`, `share-card.tsx`, Pass 04: `risk.ts`, `quests.ts`, `notifications.ts`, `audience-verify.ts`, `promo-codes.ts`, `integrations.ts`, `export.ts`, Pass 05: `payouts.ts`, `disputes.ts`, `evidence.ts`, `directory-ugc.ts`, `pdf.ts`, `gdpr.ts`, Pass 06: `social-promote.ts`, Pass 07: `explore.ts`, Pass 08: `offers.ts`, `retention.ts`, and Pass 09: `collections.ts`, `audience-capture.ts`, `saved-campaigns.ts`).
- **`src/server/security/`:** `password.ts` (`scrypt2`), `totp.ts` (RFC 6238), `mfa.ts` (enrollment, step-up, recovery, `requireFreshMfa`, `requireAdminMfaSession`), `passkeys.ts` (WebAuthn ES256/RS256 SPKI + RP/origin + monotonic `signCount`), `crypto.ts` (AES-256-GCM record-bound secret boxes), `email.ts` (verification/reset tokens + encrypted `MailOutbox`), `approvals.ts` (dual-control `FinancialApproval`), `webhook-signature.ts`.
- **`src/server/providers/`:** Explicit development-simulated payment, email, and conversion ports (`payments.ts`, `email.ts`, `conversions.ts`) plus zero-dependency production-structured Stripe Checkout / HMAC and Resend adapters (`adapters.ts`).
- **`src/components/`:** Modular React client surfaces (`landing.tsx`, `public-pages.tsx`, `auth.tsx`, `dashboard.tsx`, `campaigns.tsx`, `event-studio.tsx`, `growth.tsx`, `profile-editor.tsx`, `profile-modules.tsx`, `security.tsx`, `admin.tsx`, `admin-pass02.tsx`, `ui.tsx`, `workspace-ui.tsx`, Pass 04: `notifications-bell.tsx`, `pass04-creator.tsx`, `pass04-advertiser.tsx`, Pass 05: `pass05-creator.tsx`, `pass05-advertiser.tsx`, `pass05-security-admin.tsx`, Pass 06: `pass06-promote.tsx`, Pass 07: `pwa-mobile.tsx`, `pass07-explore.tsx`, Pass 08: `pass08-viral.tsx`, `pass08-retention.tsx`, and Pass 09: `pass09-collections.tsx`, `pass09-studio.tsx`).
- **`src/lib/`:** Client API & lossless formatters (`api.ts`), deduplicated hooks (`hooks.ts`), safe navigation (`navigation.ts`), share recovery & vanity slug validation (`share-recovery.ts`), local zero-dependency ISO/IEC 18004 QR Code SVG encoder (`qr.ts`), shared social channel registry & EN/FR template builder (`social-channels.ts`), OS/locale Smart Routing (`smart-routing.ts`), 5 turnkey 30s campaign blueprints (`campaign-templates.ts`), RFC 5545 `.ics` builder (`ics.ts`), XP streak & badge engine (`retention.ts`), granular notification preferences (`notification-prefs.ts`), collection slug validator (`collections.ts`), deterministic video script & 3-slide carousel generator (`video-scripts.ts`), types (`types.ts`).
- **`scripts/`:** `configure-development.mjs`, `local-postgres.mjs`, `seed.ts`, `bootstrap-admin.ts`, `provision-admin.ts`, `process-outboxes.ts` (advisory-locked), `inspect-dev-mail.ts`, `optimize-assets.mjs`, `verify-migrations.mjs`.

---

## 5. Implementation Status (Pass 01 → Pass 09)

- **Pass 01 (Foundation, `cbd762a`):** Core modular monolith, identity/onboarding, public Ruvora Links, campaigns, validated activities, immutable balanced ledger, Margin Governor, versioned economic rules, canonical artwork, EN/FR i18n.
- **Pass 02 (Attribution & Sponsored Events, merged to `develop` at `d93608b` via PR #2):** Server-issued opaque attribution, direct bounded referrals, creator/advertiser/admin growth analytics, customizable public profile modules, sponsored events with segregated `EVENT_PRIZE` reserves, deterministic frozen settlement with two-person MFA approval, TOTP MFA + recovery codes, encrypted `MailOutbox`, signed durable webhook inbox, and 4 forward migrations.
- **Pass 03 & Pass 04 (Merged to `develop` at `e73bc2d` via PR #3):**
  - **Pass 03:** 0 prod dependency vulnerabilities, production HSTS, `__Host-ruvora_session`, `scrypt2`, SSRF-hardened `safeUrl`, IP-bucket rate limiting, fresh MFA on all admin reviews, transactional dual-approval (`consumeApproval`), `pnpm admin:provision`, batched `groupBy` N+1 fixes, campaign `PAUSE`/`RESUME`, local SVG TOTP QR code, FR/EN & mobile polish.
  - **Pass 04 (`202611220008_pass04_universal_platform`):** Bio-code audience verification, Auto-Monetize toggle, 4 Luxury Warm Futurism profile themes, personal promo codes + QR, Reliability Score & Trust Tiers, XP-only progression quests, CSV ledger exports, universal multi-criteria targeting, Live Addressable Audience Estimator, Pro ROI Analytics, Conversion Webhook Hub, Agency `WorkspaceMember`, server Activity Risk Engine, relevance-ranked Opportunities, and persistent Notifications.
- **Pass 05 (Merged to `develop` at `0a38fdf` via PR #4, forward migration `202611220009_pass05_platform_completeness`):**
  - **Technical & Security Hardening:** Next.js 16 strict per-request nonce CSP (`src/proxy.ts`), tuned PostgreSQL pool + jittered exponential retry backoff + worker advisory lock (`src/server/db.ts`, `scripts/process-outboxes.ts`), structured JSON logging with secret redaction (`src/server/logger.ts`), live readiness probe (`GET /api/ready`), cursor pagination & batched streaming CSV (`streamWalletCsv`), 5-module CSS split (`src/app/styles/`), deduplicated `useResource`, real-time SSE notifications (`GET /api/notifications/stream`), WebAuthn Passkeys (`src/server/security/passkeys.ts`), GDPR Article 20 JSON export & Article 17 ledger-preserving PII anonymization (`src/server/gdpr.ts`), and zero-dependency Stripe/Resend production adapters (`src/server/providers/adapters.ts`, `src/server/providers/email.ts`).
  - **End-to-End Wiring & High-Value Capabilities:** Multi-workspace Agency RBAC (`src/server/workspaces.ts` + `WorkspaceSwitcherBar`), per-advertiser dedicated HMAC webhook key resolution with 24h rotation grace window (`integrations.ts`, `webhooks.ts`), deterministic weighted A/B split-testing on `/go/[slug]` attribution (`attribution.ts`, `activities.ts`), 2-phase immutable ledger Creator Payouts (`payouts.ts`), Four-Eyes Activity Appeals + magic-byte Visual Evidence (`disputes.ts`, `evidence.ts`), Opt-In Creator Directory + Direct Invitations + UGC Deliverables (`directory-ugc.ts`), per-creator campaign caps & 1-click duplication, zero-dependency PDF 1.4 Invoices & Statements (`pdf.ts`), and Embeddable Widget (`/embed/[handle]`).
- **Pass 06 (Merged to `develop` at `c1480e3` via PR #5, forward migration `202611220010_pass06_social_promotion`):**
  - 60-Second Express Promoter Wizard (`POST /api/promote/quickstart`), Social Promotion Studio (`/app/promote`) across 10 social networks with EN/FR disclosures & telemetry-only share tracking, multi-format downloadable PNG+QR social cards (`9:16` Story, `1:1` Square, `16:9` Banner), curated public Showcase collections (`CreatorShowcaseItem`) + viral referral CTAs & transparent direct referral funnel (`/app/referrals`), per-channel social analytics (`byChannel` / `bySocialChannel`), advertiser brief disclosure/hooks, and 3 XP-only social quests.
- **Pass 07 (Merged to `develop` at `4c8d49f` via PR #6, forward migration `202611230011_pass07_mobile_explore_conversion`):**
  - **Installable PWA & Mobile Sticky Bottom Tab Bar:** Next.js 16 `src/app/manifest.ts` + Sharp-derived canonical orb icons (`public/assets/pwa/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`), `PwaInstallBanner`, and thumb-friendly 5-tab fixed bottom bar on mobile (`<= 900px`) with `safe-area-inset-bottom` support.
  - **Public Discovery Marketplace (`/explore` & `GET /api/explore`):** Open-access SSR catalog of approved active campaigns and verified opt-in creators with search/objective/network/country filtering, `?campaign=<id>` deep-link pre-selection into `/app/promote`, and a transparent pedagogical RU & XP simulator powered by the active `EconomicRule` weights (zero guaranteed income).
  - **Smart Routing (`/go/[slug]` & `listCampaigns`) + 30-Second Templates & Auto-Matching:** SSRF-hardened OS (`iOS` / `Android`) and `Accept-Language` destination routing preserving `AttributionContext` intact; 5 turnkey bilingual campaign blueprints (`src/lib/campaign-templates.ts`); automatic `CAMPAIGN_MATCH` notifications to matching opt-in creators upon campaign activation.
  - **Creator Media Kit PDF 1.4 & Scheduled/Pinned Bio-Links with Click Telemetry:** Public `GET /api/media-kit/[handle]` printable press kit PDF (`src/server/pdf.ts`); backward-compatible pinned & scheduled (`startsAt` / `endsAt`) personal bio-links with strictly telemetry-only `ProfileLinkClick` recording (`POST /api/profiles/[handle]/link-click`, `GET /api/profiles/link-clicks`, zero Money/RU, covered by GDPR export & anonymization).
  - **Live Workspace Webhook Inspector & Signed HMAC Self-Test:** Workspace-isolated `WebhookEvent.advertiserId` delivery log (`GET /api/advertiser/integrations/events`, last 20 events), real round-trip HMAC-SHA256 self-test against the workspace's AES-256-GCM sealed key (`POST /api/advertiser/integrations/ping`, zero economic effect), and WooCommerce + Generic cURL HMAC snippets.
- **Pass 08 (Merged to `develop` at `41718db` via PR #7, forward migration `202611230012_pass08_viral_retention_conversion`):**
  - **Public Campaign Offer Sheets (`/offers/[id]` & `GET /api/offers/[id]`) + Dynamic Open Graph Cards (`/share-card/campaign/[id]`):** Open-access SSR campaign detail pages with transparent active `EconomicRule` RU/XP schedule, structured Creative Pack, mandatory commercial disclosure, 1-click Brief PDF 1.4 download (`GET /api/campaigns/[id]/brief-pdf`), Markdown brief copy, and dynamic OG/Twitter PNG metadata using canonical `ruvora-orb-card.png` + QR.
  - **Vanity Short Slugs (`/go/<vanity>`) & Mobile Smart Offer Bridge Card (`/go-card/[slug]`):** Owner-customizable kebab-case vanity slugs (`POST /api/share-links/customize`, strict `isVanityShareSlug` validation) and optional campaign `bridgeEnabled` mode routing cleanly after `startAttribution()` sets `HttpOnly` cookies to a mobile 1-tap promo code copy & Smart Routed outbound card (server-resolved destination only, zero open redirect).
  - **Social Content Planner & RFC 5545 `.ics` Calendar Export (`CreatorPostPlan`):** Creator-scoped post scheduler (`GET/POST /api/promote/plans`, update/delete, `GET /api/promote/plans/[id]/ics`) with 3-item partner checklist (`linkReady`, `codeCopied`, `disclosureIncluded`), strictly **0 EUR / 0 RU**, fully covered by GDPR Article 20 export and Article 17 anonymization.
  - **Weekly Streaks, Public Profile Milestone Badges, Milestone PNG Cards & Opt-In XP Community Leaderboard:** Pure XP-only streak & badge engine (`src/lib/retention.ts`, `src/server/retention.ts`), 2 XP-only planning quests (`FIRST_POST_PLAN`, `CONSISTENT_PROMOTER`), `/@handle` badge strip, `/share-card/milestone/[handle]` `9:16`/`1:1` downloads, and privacy-first opt-in XP leaderboard (`User.leaderboardOptIn`, default `false`, zero monetary/RU leak) on `/explore`.
  - **Structured Advertiser Creative Pack & Granular Notification Preferences + Encrypted Weekly Digest:** Extended `creativeBriefSchema` (`dos`, `donts`, `brandTone`, `colorPalette`, `assetUrls`) + pre-filled 30s templates; `User.notificationPrefs` gating in-app alerts (`CAMPAIGN_MATCH`, `PAYOUT_*`, `UGC_*`, `CAMPAIGN_INVITATION`); encrypted `WEEKLY_DIGEST` emails queued into `MailOutbox` (`POST /api/notifications/digest` + advisory-locked `queueDueWeeklyDigests` worker step in `scripts/process-outboxes.ts`, formatted in EN/FR in `ResendEmailProvider`).
- **Pass 09 (Multi-Offer Packs, Audience Capture & Carousel/Video Studio, branch `feature/pass-09-packs-audience-carousel`, forward migration `202611230013_pass09_collections_audience_saved`):**
  - **Shareable Multi-Offer Collections (`/c/[handle]/[slug]` & `GET /api/collections/[handle]/[slug]`) + Dynamic OG Cards (`/share-card/collection/[handle]?collection=[slug]`):** Creator-curated themed packs grouping 1–6 active campaigns with personal promo codes, per-offer notes, server-signed `/go/[slug]` attribution links, native Web Share API fallback, and `1200×630` OG / `9:16` Story PNG downloads (zero advertiser budget minor units exposed).
  - **Double Opt-In Creator Audience Capture / Newsletter (`AudienceSubscriber`):** Optional email opt-in widget rendered on `/@handle` and `/c/[handle]/[slug]`, AES-256-GCM encrypted subscriber emails at rest, encrypted `AUDIENCE_CONFIRM` `MailOutbox` double-opt-in & 1-click unsubscribe tokens (URL fragments), creator confirmed-only dashboard & formula-safe CSV export (`GET /api/promote/audience/export`), strictly **0 EUR / 0 RU**, fully covered by GDPR Art. 17/20.
  - **Deterministic Short-Form Video Script Studio (TikTok 15s / Reels 30s / Shorts 30s) & 3-Slide Carousel PNG Kit:** Pure deterministic EN/FR storyboard generator (`src/lib/video-scripts.ts`) driven by the advertiser's Creative Pack + downloadable 3-slide `4:5` (`1080×1350`) / `9:16` (`1080×1920`) PNG slides (`/share-card/carousel/[handle]?campaign=[id]&slide=1|2|3&format=portrait|story`) with canonical `ruvora-orb-card.png`, promo code & QR.
  - **Saved Campaigns (`SavedCampaign`), Side-by-Side 3-Offer Comparator & Low-Capacity / Resume Alerts:** Open-access 3-offer side-by-side comparator on `/explore`, authenticated bookmarking on `/explore` and `/offers/[id]`, and preference-gated `SAVED_CAMPAIGN_ALERT` alerts when a saved offer drops below 20% funded capacity or resumes from pause.
  - **Channel-Tracked Direct Referrals (`/r/[handle]?channel=...`) & 2 XP-Only Quests:** Normalized social channel tagging on `/r/[handle]` flowing into `getReferralFunnel().byChannel` inside `/app/referrals`, plus 2 XP-only quests (`FIRST_COLLECTION` +50 XP, `AUDIENCE_BUILDER` +75 XP).

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
pnpm worker:once          # Processes mail/webhook outboxes & due weekly digests under advisory lock, expires approvals, prunes rate limits
```

### Production admin provisioning (never run with demo flags)

```sh
ALLOW_ADMIN_BOOTSTRAP=true BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... pnpm admin:bootstrap
ALLOW_ADMIN_PROVISION=true PROVISION_ADMIN_EMAIL=... PROVISION_ADMIN_PASSWORD=... pnpm admin:provision
```

### Verified checks on `feature/pass-09-packs-audience-carousel` (2026-11-23)

- `node scripts/verify-migrations.mjs` — **PASS** (`cleanMigrations: 13`, `upgradeMigrations: 13`, `exactEconomicHistoryPreserved: true`, digest `35a837f83f7663c7efc45a16ecd1ada49750bd3ccd1c5d7985a0696ef0ffbd75`)
- `pnpm format:check` — **PASS**
- `pnpm lint` (`eslint . --max-warnings 0`) — **PASS (0 warnings, 0 errors)**
- `pnpm typecheck` (`prisma generate && next typegen && tsc --noEmit`) — **PASS**
- `pnpm audit --prod --audit-level=high` — **PASS (0 production vulnerabilities)**
- `APP_URL=http://localhost:3000 pnpm test` (Vitest unit) — **19/19 files, 313/313 tests PASS**
- `DATABASE_URL="$TEST_DATABASE_URL" pnpm test:integration` (isolated PostgreSQL 18.4 `ruvora_test`) — **12/12 files, 99/99 tests PASS**
- `pnpm build` (Next.js 16.4.6 Turbopack standalone + `src/proxy.ts` + `/c/[handle]/[slug]` + `/r/[handle]` + `/share-card/[kind]/[slug]`) — **PASS**
- `pnpm worker:once` (advisory-locked outbox + weekly digest processing) — **PASS**
- Playwright E2E (`tests/e2e/*.spec.ts`, including `pass09-packs-audience-carousel.spec.ts`) — **24/24 tests PASS** (0 retries, 0px horizontal overflow across 360px–1920px including `/c/[handle]/[slug]`, `/@handle`, `/explore`, `/app/promote`, `/app/referrals`)
- Live French browser verification & visual QA — `/api/ready` HTTP 200 (`migrationsApplied: 13`), `/explore` side-by-side 3-offer comparator & bookmarks, `/app/promote` deterministic 15–30s video scripts + live 3-slide `4:5` (`1080×1350`) carousel PNGs + multi-offer collection studio, `/c/mira/mes-bons-plans-ete` mobile pack (`0px` overflow at `390×844`) + dynamic `1200×630` OG PNG, `/@mira` double opt-in AES-256-GCM audience capture, and `/app/referrals` channel-tracked `/r/[handle]?channel=...` invite switcher & source breakdown.

---

## 7. Remaining Launch Gates (Do Not Claim Production Readiness Before Completion)

1. **External live provider credentials & contract tests:** Configure and contract-test live `STRIPE_SECRET_KEY` / Stripe Connect payouts / chargeback webhooks, live `RESEND_API_KEY` + verified sender domain (`EMAIL_FROM`), S3-compatible object storage for evidence attachments, and externally audited audience/conversion integrations where required.
2. **Target infrastructure & containers:** Execute Docker image build/boot (`runner` and `migration` targets), Abacus/cloud deployment smoke tests, HTTPS/reverse-proxy cookie/origin validation, scheduled `pnpm worker:once` monitoring/alerting, and database backup + restore drills.
3. **Compliance, legal & security assurance:** Complete jurisdictional tax/VAT/invoicing legal review, real KYC/KYB verification vendor onboarding, age/geo controls, privacy/retention documentation, load testing, and an independent third-party penetration test.
4. **Testing rules:** Keep new tests strictly under `tests/**/*.test.ts`; run integration suites sequentially against an explicit `*_test` database; never capture screenshots/traces while TOTP secrets or recovery codes are rendered; never reset TOTP replay counters to pass tests.
