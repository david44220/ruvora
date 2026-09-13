# Ruvora project memory

## Purpose

Independent creator economy platform: public Ruvora Links, eligible advertising participation, events, progression and sustainable revenue sharing. Initial creator access threshold is configurable around 10 followers; no guaranteed income. Original requirements: [docs/MASTER_BUILD_BRIEF.md](docs/MASTER_BUILD_BRIEF.md).

## Permanent rules

- Modular monolith. Server-side roles/ownership/policy authorize sensitive actions.
- Money, RU, XP and Event Points are four separate systems.
- Money is exact and ledger-backed. Never directly mutate authoritative balances or silently alter finalized economic history.
- Deposits create no final RU. Advertiser RU follows genuine validated/billable delivery.
- Global distribution categories, coefficients and margin constraints are configurable and versioned. Finalized snapshots are immutable; corrections are audited.
- Direct, bounded referrals only. Unknown eligibility cannot silently grant economic rights.
- UI strings live in EN/FR dictionaries. User content is not auto-translated.
- GitHub repository `david44220/ruvora` is canonical. Work on feature branches, target `develop`, and require reviewed CI before integration into `main`.
- Read AGENTS.md and relevant economy/ledger/visual documentation before changes. Report executed checks honestly.

## Stack and visual identity

Next.js 16.3.5, React 19.3.0, Prisma 7.10.0, Tailwind 4.3.3, TypeScript, PostgreSQL 18, Node.js 24 LTS, pnpm 11.19.0. Docker standalone deployment targets portable Abacus infrastructure.

Luxury warm futurism: obsidian, warm ivory, champagne, amber/copper. Reuse the same canonical interlocking glass/ribbon orb assets across hero/profile/events/dashboard/share surfaces. Three actual raster originals were generated with the built-in image tool. No specific model version is claimed because the tool exposed no model selector. See VISUAL_ASSET_MANIFEST.md.

## Current foundation

Identity and multi-role auth, public profile model, campaigns/activity, economy/policy domain services, events/points, ledger/distribution persistence, EN/FR UI and CI/deployment scaffolding are implemented as the first vertical slice. RELEASE_REPORT.md records exact delivered scope and final verification.

Local PostgreSQL helper: `pnpm db:local`; loopback 54329; real PG18.4 binary; dev/test databases `ruvora`/`ruvora_test`; persistent `.local/postgres`; clean `pg_ctl` shutdown; never deletes data. Native dependency builds and initial DB startup were verified. Use explicit local `DEMO_PASSWORD` for the seed. The helper and seed are development-only.

## Limits and next work

No live payment/payout adapter, trusted social verification, transactional mail delivery or target Abacus deployment. Consult RELEASE_REPORT.md for actual GitHub CI status. A separate explicit first-admin bootstrap script exists; it creates no demo fixtures, rules or money. Target-environment bootstrap verification and operator recovery/MFA remain launch work. Complete recovery/verification, operator MFA, payment reconciliation, trusted ad evidence, privacy/retention workflows, monitoring, restore drills and target Linux/container tests before launch.

Docker is absent in the initial Windows environment. Application checks, browser results and exact test counts belong in RELEASE_REPORT.md and must be updated by the final validation pass. Prioritize invariant/concurrency tests and coherent end-to-end flows over expanding shallow screens.
