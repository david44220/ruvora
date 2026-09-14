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

## Current implementation

Pass 02 adds opaque visitor/account-bound attribution, trusted creator activity credit and real analytics, direct bounded referrals, separately funded sponsored event reserves and deterministic independent settlement. Security includes encrypted MFA credentials/outbox, token recovery, revocation, signed durable webhooks and approval foundations. See RELEASE_REPORT.md for exact evidence and current branch/PR; Pass 01 is archived under docs/releases.

Canonical repo is david44220/ruvora. Feature work targets develop; neither pass is silently promoted into main. Pass 02 branch is feature/pass-02-attribution-events based on Pass 01 cbd762a, implementation 58482fb, delivered as draft PR 2 targeting develop. Local and GitHub Ubuntu validation passed 239 unit, 68 PostgreSQL and 20 browser tests. Finalized economic history is preserved; use forward migrations only.

Run pnpm dev:configure, pnpm db:local, pnpm db:generate, pnpm db:migrate, pnpm db:seed, pnpm dev. Configure private local secrets before seed. Both demo admins use distinct derived TOTP secrets; critical operations require fresh MFA. Worker: pnpm worker:once. Development mail is private and simulated.

## Limits and next work

External email/payment/payout delivery and Abacus deployment are not connected. Event settlement enforces dual approval; other high-risk operation types have an approval model plus fresh-MFA gates, with full dual-approval policy integration remaining. Retention is documented, not an automatic erasure service. Provider reconciliation, verified audience evidence, operational monitoring, restore drills, jurisdictional review and target Linux/container validation remain launch gates. Docker is unavailable on this Windows host; never claim a container or live deployment test from an application build.

New tests live only under tests/**/*.test.ts; ignored .local verification checkouts must never be discovered. Financial tests run sequentially against explicit isolated test databases. Browser tests create unique development fixtures and leave immutable history intact. Preserve all original Pass 01 assertions while evolving secure request contracts.
