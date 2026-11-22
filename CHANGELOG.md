# Changelog

## Pass 03 — security, UX, i18n & operational hardening (unreleased)

- **Supply-chain & dependency security:** Upgraded Next.js to `16.4.6`, Zod to `4.6.7`, Sharp to `0.35.5`, Prisma to `7.10.1`, Vitest to `5.1.1`, and added constrained overrides in `pnpm-workspace.yaml` (`source-map-js`, `fast-uri`, `effect >=3.22.1 <4`), reducing production dependency vulnerabilities (`pnpm audit --prod`) from 46 (including 3 critical) to **0**; added CI `pnpm audit --prod --audit-level=high` gate.
- **Security & governance hardening:** Added production HSTS (`max-age=63072000; includeSubDomains`), upgraded password hashing to `scrypt2` (`N=32768`, `r=8`, `p=1`) with transparent login upgrade from legacy `scrypt$`, hardened `safeUrl` against SSRF/private IP targets, expanded reserved handles to 24 operational slugs, added IP-bucket rate limiting across auth/reset/redirect/share-card/webhook/attribution routes with worker cleanup (`pruneExpiredRateLimits`), anchored `/go/[slug]` redirects to canonical `APP_URL`, enforced fresh MFA across all admin campaign/activity/event reviews, added `requireAdminMfaSession` on non-dev admin reads, integrated `consumeApproval` dual approval into distribution finalization, rule updates, activity reversals, and account holds/suspensions, added authenticated password change (`POST /api/security/password/change`), and added `pnpm admin:provision` for second independent admin creation.
- **Performance & backend workflows:** Eliminated N+1 queries in `listCampaigns()` and `getDashboard()` via batched `groupBy` aggregations; added advertiser campaign `PAUSE`/`RESUME` transitions (`POST /api/campaigns/:id/transition`).
- **UX, Visual & FR/EN i18n fixes:** Fixed legacy seeded event localized rules display; fixed FR i18n label mismatches across Wallet, Advertiser Analytics, Admin Growth, Approvals Refresh, singular/plural day badges, and localized root `<title>`/`<meta description>`; added local zero-dependency SVG QR code for TOTP MFA enrollment, per-session revoke selector, Change Password UI, live EUR and basis-points percentage previews on financial forms, Campaign Pause/Resume controls, Admin MFA status banner, readable Distribution Preview breakdown table, Validated Activities reversal panel, Account Suspension control, Audit Trail filter, and clickable Approval selector; fixed mobile Hero contrast scrim, mobile Header CTA wrapping, Creator Studio 1-day bar width, and Public Profile share bar alignment.

## Pass 02 — attribution and sponsored settlement (unreleased)

- Connected public creator links to immutable visitor/account attribution, bounded direct referrals and validated creator/advertiser analytics.
- Added separately funded event prize reserves, frozen deterministic standings, independent MFA approvals and exactly-once ledger settlement.
- Added encrypted security email, account recovery, replay-resistant MFA, session revocation, durable signed callbacks and explicitly simulated payment adapters.
- Preserved finalized history with four forward migrations and expanded PostgreSQL concurrency and browser coverage.
- See [RELEASE_REPORT.md](RELEASE_REPORT.md) for exact validation, GitHub delivery and remaining production launch gates.

## 0.1.0 — initial foundation (unreleased)

- Established Ruvora's independent product identity and modular monolith structure.
- Added the Next.js/TypeScript/PostgreSQL/Prisma foundation with separate identity, policy and economy boundaries.
- Developed the first profile, campaign, validated-activity, event, ledger and distribution vertical slice; final delivered scope is recorded in the release report.
- Created three coordinated canonical raster artworks: flagship, standalone orb and event composition, preserving generation prompts and honest provenance.
- Added a persistent local PostgreSQL 18 helper, development database seed contract, portable container packaging and PostgreSQL Compose configuration.
- Added separate CI quality and database integration jobs and documented startup, deployment, security, localization and follow-up work.

No live payments or production deployment is implied by this entry. GitHub delivery and actual remote CI status are recorded in the release report. Exact local checks and remaining limitations belong in [RELEASE_REPORT.md](RELEASE_REPORT.md).
