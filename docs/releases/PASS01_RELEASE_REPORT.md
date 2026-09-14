# Ruvora 0.1.0 — release report

Recorded 2026-09-13. This is the implemented P0 foundation, with development fixtures and explicit launch gates. It is not a claim that the entire master brief, production money operations, or public deployment is complete.

## 1. What was implemented

A persistent application spanning account creation and onboarding, multi-role workspaces, editable public creator profiles, advertiser campaigns, independent activity review, events, separate XP/Event Points/Reward Units, immutable accounting and configurable distribution. Includes bilingual interfaces, generated canonical artwork, development data, tests, CI and operational documentation.

## 2. Architecture

A modular monolith: Next.js pages and client components call thin API handlers; server application services authorize requests and coordinate PostgreSQL transactions; pure economy and policy modules define deterministic rules. Sensitive state is never authorized by client rendering. Domain boundaries and extraction criteria are in ARCHITECTURE.md.

## 3. Stack

Node.js 24.18.0 locally, pnpm 11.19.0, Next.js 16.3.5, React 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.3, Prisma/client/adapter 7.10.0, PostgreSQL 18.4 locally, Zod, Vitest 5.0.0 and Playwright 1.63.0. Resolved packages are locked in pnpm-lock.yaml. Linux production is packaged as a standalone Node application.

## 4. Database

18 Prisma models and three committed PostgreSQL migrations cover identity, sessions, profiles, rules, campaigns, activities, provenance, accounting, events, referrals and auditing. Unique constraints, foreign keys, indexed access paths and database triggers reinforce service checks. Clean test database migration and development seeding were executed. The seed is repeatable and does not overwrite existing profile edits/passwords. No production migration or restore drill was executed.

## 5. Authentication

Salted scrypt passwords, random opaque sessions stored as hashes, HttpOnly cookies, expiry/revocation, suspended-account rejection, persistent authentication rate limits and same-origin mutation checks. Public registration allows ordinary roles but never ADMIN. Secure host-prefixed production cookies and explicit first-admin bootstrap are implemented. Production rejects demo identities. Email verification delivery, password recovery and administrator MFA remain incomplete.

## 6. User experience

Registration, locale selection, onboarding, account settings, dashboard, opportunities, pending activity submission, event joining, activity history and separate balance/progression summaries are connected to real local persistence. Pending activity grants no rewards. Empty, loading, error, eligibility and development states are visible.

## 7. Creator experience

An account can add the creator role, declare its audience, edit its identity/bio/category, maintain multiple social profiles and custom links, publish a Ruvora Link and inspect actual creator activity. The configurable initial audience threshold is 10 followers. Self-declared counts are labelled; no external audience verification or income guarantee is implied.

## 8. Advertiser experience

Advertisers create campaign drafts, specify objective, destination, schedule and budget, simulate funding in development, submit for independent approval and inspect validated delivery. Ownership, dates, available budget, daily caps and permitted state transitions are checked on the server. The deposit UI is explicitly a development fixture, not a real payment integration.

## 9. Ruvora Link

Public `/@handle` pages use persisted creator data, multi-link editing, social destinations, event participation links, referral attribution entry, native share/clipboard behavior and server-generated canonical/OG metadata. Encoded `@` route handling was fixed against the installed Next version. A browser regression verifies that saving a bio preserves all existing link rows. Avatar uploads, theme editing and individualized rendered social cards remain future work.

## 10. Advertising Engine

Campaign lifecycle, review, participation, manual evidence submission, validation, billable delivery, caps and reversal are implemented. Rules and advertiser RU coefficients are versioned. Production conversion/provider verification, invalid-traffic detection and live funding are not connected.

## 11. Validated Activity

Submission creates a pending record. An independent administrator reviews evidence and approves or rejects. Validation atomically charges available campaign funds and creates the corresponding RU, XP and eligible Event Points. Self-benefiting reviewers are rejected. Conversion approval requires explicit evidence verification. Idempotency, serializable retries and uniqueness prevent repeated charges/awards; reversal uses compensating history and refuses silent changes to finalized distributions.

## 12. Reward Unit Engine

Exact bigint micro-units, separate USER/CREATOR/ADVERTISER categories, provenance, rule versions, eligibility and explicit lifecycle are implemented. Pending activity creates zero final RU. Distributions consume eligible units once. RU are neither spendable cash nor transferable tokens. Post-finalization recovery and comprehensive held-RU operations remain launch work.

## 13. Advertiser RU

Advertiser RU follow independently validated, billable delivery, using a versioned coefficient. Depositing money or funding a campaign creates zero RU. Unit, integration and browser evidence verify this separation.

## 14. Event Engine

Persisted events include schedules, membership, associated campaigns, points and deterministic rankings. Public event pages provide share metadata, dates, participant count, personal points, a leaderboard, participation entry and rules. Entry is free in the development event. Event creation tooling, sponsor operations, prize settlement and a full event lifecycle console remain incomplete.

## 15. Event Points

Event Points are earned from eligible validated activity while the participant is a member of an active event. They are separate from XP, RU and money. Reversals append negative entries. Ranking sorts points descending, earliest attainment and finally stable identity. Event scores do not constitute a payout obligation.

## 16. Ledger

Integer minor-unit, single-currency balanced transactions and immutable entries represent campaign funds, recognized revenue, pool funding and participant liabilities. Database constraints reject unbalanced/negative protected accounts, economic-history mutation and adding postings to closed transactions. No authoritative monetary balance is directly edited. Reconciliation and operational recovery still require production exercises.

## 17. Global Distribution Pool

An administrator previews a closed period using a persisted rule snapshot, financial inputs and a fingerprint. Eligible allocations use deterministic largest-remainder rounding. Finalization rejects stale rules, changed eligibility and overlapping finalized periods, atomically funds the pool, posts participant liabilities and consumes eligible RU. Finalized snapshots cannot be rewritten. Production distribution rejects contaminated demo history. This is an internal accounting flow, not bank payout.

## 18. Margin Governor

The configurable governor accounts for declared costs, liabilities, reserves, retained revenue and operating profit targets before releasing a distributable pool. Category shares and thresholds are versioned, with an explanation available in the admin preview. An unknown business target is configurable; a permanent EUR 500 target was not invented. Correctness depends on complete operator-supplied costs/liabilities until real provider reconciliation exists.

## 19. Trust and Safety

Server-side roles, ownership, independent reviews, country/age/hold policy gates, rate limits, validation provenance, audit trails, explicit demo isolation, same-origin checks and security headers are implemented. Social verification, mature fraud operations, appeals, privacy retention/deletion/export, production legal policy and external security assessment remain launch gates. Draft informational privacy/terms screens are not approved launch policies.

## 20. Admin

Protected administration supports campaign approval, activity evidence review/rejection/reversal, economic holds, versioned rule editing, distribution preview/finalization and audit inspection. Reviewer reasons are captured. First-admin creation is a separate explicit bootstrap script. Operator MFA, recovery, two-person settlement approval and richer monitoring are not complete.

## 21. Internationalization

Central typed EN/FR dictionaries, localized API errors, number/date formatting and a persisted locale cookie cover core surfaces. User-authored content is preserved. Browser tests verify French dashboard/login behavior and persistence across reload/logout/login; unit tests verify key and interpolation parity. Professional translation review and browser-language negotiation remain follow-up work.

## 22. Visual system

Warm obsidian, ivory, champagne and copper combine editorial typography with bespoke illuminated glass/ribbon artwork. Shared navigation, profiles, event art, workspaces, cards, state treatments and responsive layout retain the same visual family. Motion is restrained and reduced-motion preferences are respected. No heavy WebGL scene is required.

## 23. GPT Image 2.5 assets generated

Three raster originals were actually generated using the available built-in image generation tool. That tool did not expose a model selector or verifiable model-version metadata. Therefore GPT Image 2.5 provenance is **unverified**, and this requirement cannot honestly be marked satisfied at that exact model version. Prompts and provenance are preserved in docs/ARTWORK-PROVENANCE.md. Original outputs were 1672×941 for the flagship/event and 1254×1254 for the orb; native 4K generation was not achieved.

## 24. Canonical Ruvora assets

PNG masters under assets/masters preserve the flagship, orb and event originals. Optimized WebP exports, responsive variants and a 1200×630 share crop are under public/assets. The manifest and repeatable optimization script document every export. Main WebP files are approximately 186 KB, 302 KB and 166 KB respectively; no upscaling is presented as native resolution. These canonical assets are reused across actual UI surfaces.

## 25. Responsive validation

Chromium automatically checked homepage and public profile at 360, 430, 768, 1024, 1440 and 1920 pixels, including image loading and document/body overflow. An additional event check covers 390 pixels. Desktop/mobile screenshots cover the principal public and role-based surfaces; representative images are committed under docs/qa. A real overflowing decorative element was fixed. No physical phone, Safari, Firefox or 4K-monitor test is claimed.

## 26. Accessibility work

Semantic sections, labelled form controls, keyboard-operable controls, visible focus, meaningful link labels, decorative image alternatives, skip navigation, responsive readability and reduced-motion styling are present. Dynamic errors and progress states are visible. No automated axe report, assistive-technology audit or WCAG conformance certification was completed; these remain explicit acceptance work.

## 27. Performance work

Standalone Next output, responsive image sizing, modern image formats, compressed canonical assets, eager critical artwork and deferred noncritical art avoid unnecessary payload and heavy 3D runtime. Production compilation succeeded. Browser captures recorded zero console errors or uncaught page exceptions. Image loading advice was corrected and a subsequent focused browser audit recorded zero image warnings. A non-failing PostgreSQL adapter deprecation warning remains; no Lighthouse score, production Core Web Vitals or load-capacity number is claimed.

## 28. Tests executed

Executed formatting checks, zero-warning ESLint, generated Prisma/Next route types and TypeScript checks, unit tests, real PostgreSQL integration tests, Playwright browser journeys, clean committed migrations, seed/reseed, a production build and manual screenshot inspection. The core browser journey creates new user/creator/advertiser accounts and uses a separate seeded administrator for approval. The CI sequence was also exercised locally: seed the test database, run integration tests that finalize periods, then run the complete browser suite against that same database. Database API assertions complement visible form actions.

## 29. Exact test results

- Unit tests: **111 passed**, four files, recorded final suite 2.19 seconds.
- PostgreSQL integration: **14 passed**, one file, final same-database sequence 3.64 seconds.
- Chromium browser suite: **16 passed**, final same-database run reported as 1.1 minutes by Playwright. Covers four roles, economic separation, EN/FR, profile row preservation, admin preview and responsive checks.
- Final typecheck, lint and production build: passed. Formatting is enforced with Prettier.
- Final screenshot capture: 14 rendered captures; **0 console errors/page exceptions** in the capture run. Eleven representative screenshots retained in docs/qa.
- Clean migration/seed: three migrations applied successfully; development fixtures loaded and repeatability checked.
- Remote GitHub CI: **both jobs passed** for implementation commit `4f1d172`. Linux unit suite: 111 passed in 798 ms; PostgreSQL integration: 14 passed in 1.99 seconds; Chromium: 16 passed in 1.0 minute. Formatting, lint, typecheck, clean migrations/seed and production build also passed. See section 39.
- Docker build/boot, Abacus deployment, external penetration/accessibility/load tests: **not executed**.

## 30. Known limitations

Live funding, payout, email delivery/recovery/verification, administrator MFA, trusted conversion/social providers, chargeback handling, privacy workflows, prize payout and operational incident controls are incomplete. Seeded numbers are simulated. Follower claims are self-declared. Feature depth is intentionally the first coherent P0 slice; the 90-section brief is not represented as fully delivered.

## 31. Remaining technical debt

Add outbox-backed providers and background work; paginate larger operational histories; improve observability, rate-limit retention, CSP nonce handling, auditing and economic recovery; validate least-privilege runtime/migration credentials; expand independent browser and accessibility coverage. ESLint remains on the version supported by installed plugins. The PostgreSQL adapter concurrent-query deprecation should be followed upstream and removed before a breaking runtime update.

## 32. P1 completed

Partial P1 foundations include direct referral attribution, rule-versioned bounded referral domain logic, creator/advertiser summaries from actual records, canonical share metadata and configurable economic policy. Full quests/achievements, paid referral issuance, creator themes, sponsor/prize operations, advanced analytics and external social connectors are not claimed complete.

## 33. Recommended next pass

Start with verified transactional email and account recovery plus administrator MFA. Then implement trusted ad evidence and provider funding/reconciliation with refund/chargeback/recovery tests. Complete jurisdiction/privacy/prize policies and operational controls, validate the container and restore procedure in staging, and only then approve live-money release. See ROADMAP.md for ordered continuation.

## 34. Local startup instructions

Use Node 24 and pnpm 11.19.0. Run `pnpm install --frozen-lockfile`, copy `.env.example` to `.env`, set a private local `DEMO_PASSWORD` of at least 12 characters, and start `pnpm db:local` in a separate terminal. Run `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, then `pnpm dev`. Open http://localhost:3000. README.md lists the six development identities; their shared password is the local configuration value and is not committed. The existing workspace already has a private local configuration and persistent database.

## 35. Environment configuration

DATABASE_URL and TEST_DATABASE_URL must identify separate development/test databases. APP_URL is the exact mutation origin; PUBLIC_SITE_URL controls canonical URLs; NEXT_PUBLIC_APP_URL is reserved build-time configuration and is not currently consumed by application components. APP_ENV labels the environment. Development seed/funding flags are explicit and ignored/refused in production-sensitive paths. Production must replace local credentials, omit DEMO_PASSWORD, use HTTPS and an uncontaminated database. Bootstrap credentials are one-time operator secrets, never checked into source.

## 36. Docker instructions

Dockerfile supplies dependencies, build, migration and non-root standalone runner targets. Compose supplies PostgreSQL 18 and optional migration/app services. Stop the embedded DB before `docker compose up -d db`; use `docker compose --profile app up --build -d` for the container shape. `docker compose down` preserves the named volume. Docker is absent on this host, so these authored instructions have not been executed here. A clean production-mode instance needs explicit first-admin and rule initialization before readiness succeeds.

## 37. Git branch

Canonical remote: https://github.com/david44220/ruvora (private). Working branch: `feature/ruvora-foundation`. `main` and `develop` begin from a neutral empty baseline; the implementation is proposed to `develop` for review. No automatic production merge is performed.

## 38. commits

Initial baseline: `d4a86c0` — `chore: initialize Ruvora repository baseline`. Implemented application: `4f1d172` — `feat: build Ruvora creator economy foundation`. This report and final screenshots are finalized in a following documentation commit. The repository log is authoritative for subsequent changes.

## 39. PR information if applicable

Draft [PR #1 — Build Ruvora creator economy foundation](https://github.com/david44220/ruvora/pull/1) targets `develop` from `feature/ruvora-foundation`. No merge was performed. [GitHub Actions run 34761621252](https://github.com/david44220/ruvora/actions/runs/34761621252) passed both quality and integration jobs for implementation commit `4f1d172`; job logs verify 111 unit, 14 database integration and 16 browser tests. The later handoff commit updates documentation and screenshots only. Consult the PR checks for runs after this recorded implementation verification.

## 40. Abacus deployment readiness

Portable source, locked dependencies, PostgreSQL migrations, standalone packaging, liveness/readiness endpoints, environment examples, bootstrap procedure and deployment/rollback runbooks are prepared. No Abacus account, domain, TLS routing, container runtime or production database was accessed or deployed. Complete the launch gates and target-environment checks in DEPLOYMENT_ABACUS.md before describing the product as production-ready.
