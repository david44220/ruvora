# Ruvora — Pass 02 release report

Pass 02 continues the existing foundation at `cbd762ab274385e6d3e0e129672a22932a5f1c19`. Evidence recorded on 14 September 2026. Local aggregate validation and GitHub Ubuntu CI passed; publication evidence is recorded below; no live provider or Abacus deployment is claimed.

## 1. Repository state before Pass 02

Canonical repository: [david44220/ruvora](https://github.com/david44220/ruvora), private. Pass 01 contains the application, canonical artwork, three migrations, CI, 111 unit tests, 14 database tests and 16 browser tests. Its implementation remains in `feature/ruvora-foundation`, with [draft PR 1](https://github.com/david44220/ruvora/pull/1) targeting `develop`. The neutral baseline remains on `main` and `develop` pending review. Historical evidence is preserved in [the Pass 01 report](docs/releases/PASS01_RELEASE_REPORT.md).

## 2. What was changed

Added trusted attribution, direct referral credits, actual creator/advertiser/growth analytics, editable public modules, sponsored event creation and funded prize settlement, MFA/recovery, encrypted mail, approval foundations, signed durable callbacks and development payment adapters. Preserved the modular monolith, exact ledger, separate RU/XP/Event Points, canonical visuals, EN/FR and all original test scenarios. Four forward migrations extend the existing database.

## 3. Attribution Engine implementation

`ShareLink`, `AttributionContext` and `GrowthEvent` establish server-owned entry destinations and opaque random visitor/context credentials. The browser receives HttpOnly cookies; the database stores digests, immutable origin fields and a versioned policy snapshot. Registration/login binds a context to one account. `/go/[slug]` maps only server-known destinations and retains a bounded internal return path through onboarding.

## 4. Attribution security model

No participant-supplied creator handle authorizes creator RU. Strict activity schemas reject forged fields; submission resolves the trusted cookies and snapshots provenance. Checks cover tampering, unknown/expired/revoked contexts, cross-account binding, self-attribution, advertiser conflicts, campaign/event mismatch, usage caps and current eligibility. The first eligible creator and original window remain fixed. An anonymous same-creator explicit referral click may append a new immutable referral origin without extending the window; bound or competing origins cannot be overwritten. No device fingerprinting, cross-site tracking or IP collection was introduced. Expected share-link errors have localized recovery; account switching clears only share credentials and requires an explicit validated retry. Authenticated referral visitors continue to their dashboard.

## 5. Creator Monetization Loop

The browser journey verifies public profile → opaque attribution cookies → featured funded opportunity → registration/onboarding → pending activity with zero RU → independent admin validation → actual creator RU and analytics. Periodic revenue allocation remains governed by the existing exact distribution engine; RU is never a guaranteed cash amount.

**Creator acceptance: YES within the verified internal application boundary.** The real browser journey and database forgery tests establish server-controlled attribution and valid creator economic credit. External traffic authenticity and social-provider identity are not claimed.

## 6. Ruvora Link changes

Profiles now show up to three eligible funded opportunities, tracked event/invitation links and canonical share cards. Owners can reorder/show/hide five modules independently of existing socials/custom links. Bio-only editing preserves the original links. Public events are filtered by visibility/environment and projected through a whitelist; private review snapshots and administrative IDs are excluded. User-authored names, bios and URLs remain unchanged by localization.

## 7. Creator RU changes

Creator credit resolves immutable server attribution and the activity’s rule snapshot, then rechecks creator/campaign eligibility at validation. Pending estimates are visibly separate from validated RU. Legacy finalized records remain intact; an untrusted legacy creator claim cannot mint new creator RU. Revoked contexts, disallowed regions/categories/audience thresholds and self-benefit paths fail closed.

## 8. Advertiser RU hardening

Deposits, media reservations and prize funding grant no RU. Advertiser RU follows independently validated billable delivery and real campaign escrow consumption. Provider conversion evidence is correlated with the actual activity/campaign and cannot substitute for arbitrary client validation. Rejection/reversal and independent-review conflict checks remain transactional.

## 9. Referral Engine

Direct referrals use a trusted origin, versioned eligibility/window, one inviter relationship and bounded per-action/per-referral/period credits. Signup alone creates no RU or money. Duplicate actions, loops, existing/bound accounts, self/referrer-advertiser conflicts and revoked origins are tested. A new explicit development rule version enables referrals; existing historical rule JSON is not rewritten.

## 10. Viral/share infrastructure

Profile, campaign, event and referral links resolve to server-owned entries. Native share and clipboard controls expose a reusable URL. Dynamic profile/event/earned-milestone images use bounded escaped public text and canonical artwork. Milestone images require actual XP; no invented achievement or monetary reward is displayed. Acquisition/share counters derive from persisted deduplicated events.

## 11. Event creation

Creators can host zero-prize events; advertisers can create sponsored prize events. Creation includes EN/FR authored content/rules, start/end dates, visibility, countries, participant and daily point caps, versioned point rules, milestone labels and rank-share tiers. Configuration locks after submission. Owner/host/sponsor relationships derive from the authenticated actor; delegated cross-account hosting is not implemented.

## 12. Sponsored Events

Sponsored activation requires independently approved linked media, approved immutable event configuration and a fully funded prize reserve. Media dates stay within the event window. Owner lifecycle actions support submit, activate, pause, complete and cancel with reasons and idempotent operation records. Owners/sponsors/hosts cannot win their own event. Monetary prizes are visibly separate from media spend and ordinary distribution.

## 13. Event Prize Pool accounting

Advertiser available funds, campaign escrow and `EVENT_PRIZE` reserves are distinct ledger account kinds. Prize funding transfers available funds into the event reserve. Cancellation returns the unused reserve to its original sponsor. Money is exact integer cents, journals balance, negative protected balances are rejected, and deposits/reservations create no RU. The displayed prize reserve comes from ledger entries, not an editable UI balance.

## 14. Event settlement

Completion after the original end time and resolution of pending activity permit a preview that freezes points/ranking. Settlement recomputes a deterministic canonical fingerprint, requires fresh admin MFA plus a second administrator’s matching approval, and atomically posts winners’ `USER_PAYABLE` credits and unused sponsor funds. Final ranking and journal history are immutable; exact replay returns the existing result.

**Event acceptance: YES for internal ledger settlement.** The sponsored browser journey reserved €10.01, awarded €6.01 once, returned €4.00, left the reserve at €0.00 and displayed the frozen rank and wallet credit. No external bank payout occurred.

## 15. Leaderboard integrity

Rankings derive from validated Event Point entries, with exact compensating reversals and stable tie-breaking. Participant eligibility, holds and disqualification affect the preview; stale inputs invalidate finalization. Database guards freeze points, memberships and source activity after settlement begins. Final public standings use the immutable settlement snapshot and expose the authenticated participant’s prize allocation separately.

## 16. Event fraud controls

Server checks enforce country/cap/date/point limits, active membership, independent media/event review, funded reserves and no owner/sponsor/host self-participation. Reviewers and approvers cannot be prize beneficiaries. Pending activity blocks the freeze. Disqualification and holds are audited. Post-final recovery requires a separate reviewed compensation; this pass does not silently rewrite winners or implement automated post-final clawback.

## 17. Financial/ledger changes

All new monetary paths use the existing immutable balanced ledger and serializable transaction boundary. Raw SQL guards reconcile prize counterparties and enforce final-history freezes. PostgreSQL serialization retries handle both Prisma P2034 and pg-adapter P2010 SQLSTATE 40001/40P01 across generated/CommonJS and ESM Prisma runtime identities. Known-error discrimination preserves the existing five attempts, Serializable isolation and transaction timeouts. Payment retries add bounded jitter under contention. Campaign funding binds both development and available-funds sources to the same request identity while preserving legacy deposit replay.

## 18. Margin Governor changes

Distribution snapshots include actual event prize exposure. Separately reserved prize assets back their own liabilities; only uncovered event liability reduces available operating capacity, avoiding double subtraction from already-net campaign revenue. Configured provider/tax/refund/chargeback/fraud/infrastructure/operating liabilities and retained-profit constraints continue to apply. No new universal RU price or guaranteed payout was introduced.

## 19. External provider architecture

Payment ports define deposit/refund/chargeback/payout contracts. The development adapter writes visibly simulated ledger-backed available funds and bounded corrections; payouts and real payment delivery are unavailable. Email ports consume encrypted outbox template/locale/variables. Conversion callbacks store verified/rejected/reversed evidence and risk records; independent human review remains the financial decision. See [PROVIDERS.md](PROVIDERS.md).

## 20. Webhooks

`POST /api/webhooks/[provider]` preserves raw bytes, limits bodies to 32 KB, and verifies an HMAC over provider, timestamp and body with a five-minute tolerance. Immutable provider/event IDs and payload hashes detect exact duplicates and changed-payload replays. Durable inbox consumers use leases, bounded exponential retries and dead-letter states. Audited retry requires fresh admin MFA. See [WEBHOOKS.md](WEBHOOKS.md).

## 21. Email/security changes

Verification/reset tokens are purpose-bound digests with expiry and single-use atomic redemption. Reset invalidates all sessions; issuance responses avoid account enumeration. The encrypted outbox records verification, reset, password-change and MFA-change notifications. A private account mailbox and explicitly gated local inspection CLI support development; messages are not sent externally. The worker validates environment safety before queue mutations and emits bounded operation summaries without private payloads. An actual local batch processed 13 development mail records successfully. Recovery URLs use fragments and are removed after client capture.

## 22. MFA/admin hardening

TOTP credentials are authenticated-encrypted and protected by a globally monotonic accepted counter. Enrollment, password/code step-up, one-use recovery codes, session revocation and login/security auditing are implemented. Distribution finalization, event settlement, rule changes, financial reversal and high-risk holds require recent password plus MFA at the HTTP boundary. Both demo admins have distinct derived authenticators; passwords alone do not grant elevated sessions.

## 23. Approval workflow

Requests bind requester, operation, target, canonical payload hash, version, reason and expiry. A different eligible administrator approves/rejects; execution consumes the approval in the same transaction. States include requested, approved, rejected, executed and expired. Event settlement fully enforces this workflow. Other high-impact operation types have the model/validation foundation and fresh-MFA gates; broad dual-approval enforcement and monetary thresholds remain Pass 03 work.

## 24. Creator analytics

Actual profile views, attributed sessions, registrations, opportunity starts, validation/conversion/rejection counts, pending creator estimates, validated creator RU, event joins/referrals, campaign performance and ledger allocations are available. The chart/funnel uses persisted records. Legacy seeded activity may predate acquisition telemetry; no historic visit counts are invented to make funnels appear complete.

## 25. Advertiser analytics

Advertisers see campaigns, independently validated/rejected/pending activity, conversions, gross/reversed/net media spend, creator participation and advertiser RU. Campaign discovery applies account region and creator category/audience requirements. Media and sponsored-event reserve amounts remain separately visible. No external ad-network performance or live cash collection is implied.

## 26. Admin profitability analytics

Admin views expose ledger-derived validated gross revenue, retained revenue, user liabilities, advertiser available funds, campaign liabilities, event prize liabilities and the distribution pool account balance, alongside actual growth and review queues. Configured operating targets are explicit estimates. Full audited financial statements, live provider reconciliation and comprehensive operating-cost reporting remain outside this pass.

## 27. Visual improvements

Preserved the obsidian/ivory/champagne/amber visual system and canonical orb family. Added profile opportunity modules, analytics cards/chart, event creation/reserve/settlement screens, security/approval screens and tracked sharing. Mobile event rankings and wallet amounts wrap within the screen; the creator page keeps one primary heading. EN/FR, keyboard-native controls and reduced motion remain supported.

## 28. GPT Image assets newly generated, if any

None. `ruvora-orb-card.png` is a 600×600 delivery conversion of existing canonical artwork for Next ImageResponse. Dynamic cards are 1200×630 and were rendered/inspected. No new model version, native 4K image or model provenance claim is made. Reproduction is in `scripts/optimize-assets.mjs` and [VISUAL_ASSET_MANIFEST.md](VISUAL_ASSET_MANIFEST.md).

## 29. Responsive validation

The preserved browser matrix covers 360, 430, 768, 1024, 1440 and 1920 px for homepage/profile. Creator analytics, event standings, prize wallet and account security were exercised at 390 px. Responsive assertions wait for settled layout after viewport changes. Actual desktop/mobile captures of the profile, event, creator, security and referral screens recorded zero page errors and zero document overflow at 390 px. The share image rendered at 1200×630. Preserved screenshots and [visual results](docs/qa/pass02/visual-results.json) are in `docs/qa/pass02`; full device-lab and accessibility audits remain outstanding.

## 30. Database migrations

All seven migrations apply to an empty local PostgreSQL 18.4 database. A separate synthetic Pass 01 database applied the first three migrations, inserted 53 representative rows across 16 tables including finalized distribution/reversed economic history, then applied the four new migrations. The old-column digest remained `44c6431e45357a0386badcf129eebd3a2ae531e711102073fb891342079b58ef`; balances were identical, no journals were unbalanced, and repeat deploy was a no-op. Prisma schema diff is empty. This is a synthetic upgrade proof, not a production restore rehearsal. See [migration evidence](docs/qa/pass02/migration-evidence.json) and `scripts/verify-migrations.mjs`.

## 31. Tests added

Added deterministic attribution/event/security unit coverage and PostgreSQL suites for attribution/referral, event settlement, security/providers and cross-source campaign funding. New browser journeys cover creator acquisition, sponsored settlement and two account-security flows. Preserved the original 14 integration and 16 browser scenarios while replacing insecure creator-claim fixtures with trusted contexts. Added public projection, unpublished metadata, share recovery, dotenv configuration safety and worker-preflight regression coverage.

## 32. Exact test results

- Fresh dependency directory: `pnpm install --frozen-lockfile` passed, 533 packages, no local `.env` copied. Fresh private configuration and a second identical configuration run also passed; generated values were not printed.
- Unit suite: **258/258 passed** across 12 files.
- Complete PostgreSQL suite: **72/72 passed** across six files, including 21 attribution, 4 share-entry concurrency, 6 campaign-funding, 10 event-settlement, 17 security/provider and 14 preserved workflow scenarios.
- Combined browser suite: **20/20 passed** in 3.5 minutes, retaining the 16 original scenarios and adding creator attribution, sponsored settlement and two security journeys.
- After the concurrency correction, the creator browser journey passed **3/3 repeated runs with retries disabled** (55.9 seconds).
- Final `pnpm format:check`, zero-warning ESLint, regenerated Prisma/Next route types and TypeScript all passed.
- Final production application build passed, 24 dynamic routes. This does not prove Linux container boot or Abacus deployment.
- Clean/upgrade migrations and schema alignment passed as described above.
- GitHub Ubuntu CI passed for implementation `58482fb3c3ef8303b4047b3be70c7ccf48ffc7fb`: quality/build and integration/browser jobs. The remote run independently repeated **239 unit**, **68 database** and **20 browser** tests. [Verified implementation run](https://github.com/david44220/ruvora/actions/runs/34853840432).

The database guard also correctly refused an initial integration command pointed at the development database, before running tests. The pg adapter emits a deprecation warning about queued queries. The initial implementation CI passed 20/20 browsers, but a later documentation-only run exposed one intermittent creator-page failure (19 passed, one passed on retry): simultaneous first publication escaped as Prisma P2034. The follow-up recognizes actual CJS/ESM Prisma error envelopes and makes canonical share lookup read existing origins before insert. Runtime identity mismatch is reproduced by unit tests; it is not proven to be the sole cause of that CI incident. Browser CI now fails on flakes despite retaining a diagnostic retry.

## 33. Concurrency validation

Database tests cover duplicate/mixed-source funding, concurrent activity validation/referral caps, event funding/join/finalization, token/MFA replay, approvals, webhook duplicates and repeated concurrent deposits. The security suite runs three rounds of eight simultaneous identical deposits and checks one balanced economic effect. Exact replay preserves the original operation; changing its payload/source conflicts. Four new database regressions exercise 160 concurrent first/warm share/profile requests and 24 revoked/held denials with stable canonical IDs and unchanged existing-row xmin. A 72-request mixed API/server-render repeat and a separate fresh-process 24-request run passed without errors, with actual Chromium profile checks. One earlier 72-request run during the development hot-reload session returned a single generic API500; its native cause was not retained, so no specific timeout/root-cause claim is made. See [HTTP concurrency evidence](docs/qa/pass02/http-concurrency.json).

**Financial acceptance: YES within the tested internal transaction and development-provider boundary.** The complete 72-test database suite and 20 browser journeys verify retries, duplicates, reversals and concurrent execution without duplicated money, RU or event prizes for the tested paths. This is bounded test evidence, not a claim of arbitrary failure tolerance or externally reconciled payments.

## 34. Browser/E2E validation

The creator journey proves the real public Link and HttpOnly-cookie acquisition path through independent activity validation and analytics. The sponsored journey proves funded reserve → real end time → frozen ranking → two MFA admins → exact wallet/refund settlement. Security journeys prove private email verification/replay, MFA enrollment/replay, logged-out reset, old-password denial and all-session revocation. Sensitive security screenshots/traces/videos/AI DOM snapshots are disabled. The final combined run also retains the original role, profile-edit, EN/FR, distribution-preview and responsive scenarios.

## 35. Known limitations

No verified external social identity, no real payment/payout/mail delivery, no automated privacy erasure/archive worker, no full fraud/Sybil protection, no delegated event co-hosting, no nonzero event RU bonus engine and no automatic post-final prize clawback. Expanded theme/achievement catalogs and cohort/export analytics are future work. Database/application limits and review queues need realistic load testing.

## 36. External services still simulated

Development deposits, refunds, chargebacks, mail delivery and signed callback fixtures are explicitly simulated. The underlying internal ledger and database transactions are real. Non-development payment execution fails closed until a real adapter is implemented; payout delivery is unavailable. No credentials, public provider endpoint registration or external provider settlement has been verified.

## 37. Remaining compliance work

Operators must establish applicable age/geo, KYC/KYB, AML, tax, advertising evidence, privacy/retention and prize rules with qualified review. Configurable checks and exact accounting are engineering controls, not legal certification. No regulatory or jurisdictional approval is claimed.

## 38. Remaining technical debt

Integrate live adapters/reconciliation, automated retention with financial-history exceptions, broader dual-approval enforcement, independent operator bootstrap/recovery drills, durable worker monitoring, edge abuse controls and operational alert ownership. Batch profile discovery’s per-campaign balance/count reads before larger capacity targets; the current 50-campaign discovery can amplify pool pressure. Expand measured performance/capacity tests and restore/security/accessibility audits. Address the pg-adapter deprecation before a future pg major upgrade. Keep the current SQL integrity constraints when generating later Prisma migrations.

## 39. Current release classification

**PRE-PRODUCTION engineering build, with development-adapter verification.** The internal creator and sponsored-event loops work and have concrete evidence. Public launch, real-money operation and target deployment remain gated. This classification is not production readiness or a promise of earnings.

## 40. Recommended Pass 03

Prioritize reviewed email/payment/conversion/payout integrations and reconciliation, operational monitoring/backups/restore drills, complete high-impact approval policy, retention/privacy execution and verified audience/anti-abuse evidence. Then extend event delegation, compensation, analytics and creator personalization using the same canonical design and immutable accounting boundaries.

## 41. Exact Abacus deployment readiness

Portable Node 24/Next standalone and PostgreSQL packaging is present, with a separate migration/tooling image, committed assets and documented health/readiness. Configure HTTPS origins, clean staging/production databases, encryption/provider secrets and a host schedule for `pnpm worker:once`. Redis is unnecessary. Docker is unavailable on this Windows host: no Linux image boot, target Abacus account, domain/TLS routing, production backup restore or live-provider validation occurred. Follow [DEPLOYMENT_ABACUS.md](DEPLOYMENT_ABACUS.md).

## 42. Exact commands to deploy/test locally

```sh
pnpm install --frozen-lockfile
pnpm dev:configure
pnpm db:local
```

Keep the database helper running. In another terminal:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Read the generated private `DEMO_PASSWORD` from ignored `.env` for documented demo accounts. Never put private secrets in shell arguments or source control. Run worker batches separately with `pnpm worker:once`.

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Integration tests require an isolated test database; in PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://ruvora:ruvora-local-only@127.0.0.1:54329/ruvora_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
pnpm db:migrate
pnpm test:integration
```

`node scripts/verify-migrations.mjs` creates two new loopback-only audit databases and retains them. It never resets existing data. `pnpm start` runs a production build and therefore refuses development secrets/adapters at protected endpoints; use the deployment runbook’s clean environment configuration.

## 43. Git branch / commits / PR

Canonical remote: [david44220/ruvora](https://github.com/david44220/ruvora). Published branch: `feature/pass-02-attribution-events`, based on Pass 01 `cbd762a`. Implementation commit: [`58482fb3c3ef8303b4047b3be70c7ccf48ffc7fb`](https://github.com/david44220/ruvora/commit/58482fb3c3ef8303b4047b3be70c7ccf48ffc7fb).

[Draft PR 2](https://github.com/david44220/ruvora/pull/2) targets `develop` and includes the unmerged foundation from PR 1. Both `main` and `develop` still contain neutral baseline `d4a86c0`; the implementation is complete on its feature branch. All 220 files in the original implementation/handoff tree were compared with GitHub by path and Git blob hash, with zero missing, extra or mismatched files. Private local secrets were absent from the committed tree.

Implementation [GitHub Actions run 34853840432](https://github.com/david44220/ruvora/actions/runs/34853840432) passed both jobs on Ubuntu, including clean migrations/seed, all test suites and production build. Documentation handoff `c1449fc` subsequently exposed the creator-page flake described above. The follow-up concurrency correction and strict flake gate are included on the same branch; its exact current commit and latest CI result are available in [PR commits](https://github.com/david44220/ruvora/pull/2/commits) and [PR checks](https://github.com/david44220/ruvora/pull/2/checks). No automatic merge or deployment occurred.
