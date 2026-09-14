# RUVORA — PASS 02

## Attribution Engine, Creator Monetization Loop, Sponsored Events, Viral Growth, Security Hardening & Abacus Readiness

You are continuing development of the EXISTING Ruvora repository.

This is NOT a greenfield rebuild.

Do not redesign the architecture merely because you would have implemented it differently.

Preserve all working Pass 01 foundations unless there is a documented technical reason to change them.

Before modifying code:

1. Read `AGENTS.md`
2. Read `PROJECT_MEMORY.md`
3. Read `ARCHITECTURE.md`
4. Read `PRODUCT.md`
5. Read `ECONOMY.md`
6. Read `RU_ENGINE.md`
7. Read `EVENT_ENGINE.md`
8. Read `ADVERTISING_ENGINE.md`
9. Read `LEDGER.md`
10. Read `MARGIN_GOVERNOR.md`
11. Read `FRAUD_AND_RISK.md`
12. Read `SECURITY.md`
13. Read `VISUAL_ASSET_MANIFEST.md`
14. Read `DEPLOYMENT_ABACUS.md`
15. Read `RELEASE_REPORT.md`

Then inspect the current implementation and existing test suite before making changes.

GitHub remains the canonical source of truth.

---

# 1. PASS 02 OBJECTIVE

Pass 01 established a strong Ruvora foundation including:

* premium visual identity
* public Ruvora profiles
* multi-role authentication
* user / creator / advertiser dashboards
* advertising campaigns
* validated activity
* Reward Units
* XP
* Event Points
* Event foundations
* immutable financial ledger
* Global Distribution Pool
* Margin Governor
* admin foundation
* EN / FR
* Docker / CI / documentation

Pass 02 must turn those foundations into a much more complete economic and viral product.

The primary goals are:

## P0

1. Build a trustworthy **Ruvora Attribution Engine**
2. Connect attribution directly to **Ruvora Link monetization**
3. Build the first real **Creator Monetization Loop**
4. Build serious **Sponsored Events**
5. Build real **Event Prize Pool accounting**
6. Improve advertiser → creator → user economic flows
7. Build viral/referral infrastructure around actual attribution
8. Harden financial and security-critical flows
9. Prepare external payment / payout / email / webhook adapters
10. Improve production readiness for Abacus deployment

## P1

11. Expand creator analytics
12. Expand advertiser analytics
13. Improve social sharing
14. Improve Events visually
15. Improve authenticated UI polish
16. Add deeper browser and concurrency coverage

Do not waste this pass rebuilding already successful Pass 01 features.

---

# 2. CRITICAL PRINCIPLE — RUVORA LINK MUST BECOME ECONOMIC INFRASTRUCTURE

The current Ruvora public profile must evolve from:

> a beautiful creator profile

into:

> a measurable, attributable monetization entry point.

The canonical creator journey should become:

Social Network

→ `ruvora.com/@creator`

→ visitor enters Ruvora through creator attribution

→ visitor explores an eligible campaign / sponsored mission / event

→ Ruvora maintains attribution context

→ visitor performs legitimate eligible activity

→ validation pipeline verifies activity

→ advertiser becomes billable where appropriate

→ participant may receive USER RU / XP / Event Points

→ creator may receive CREATOR RU / creator economic credit

→ advertiser may receive ADVERTISER RU

→ all resulting economic state remains deterministic and auditable

This loop is central to Ruvora.

---

# 3. BUILD A REAL ATTRIBUTION ENGINE

The attribution engine is the highest priority of this pass.

Do NOT trust creator attribution supplied arbitrarily by the client.

A visitor must not be able to submit something equivalent to:

`creatorHandle = @someone`

and thereby redirect creator credit.

Create a server-controlled attribution system.

---

# 4. ATTRIBUTION CONTEXT

When a visitor arrives through an eligible Ruvora surface, create an attribution context.

Possible sources:

CREATOR_PROFILE

CREATOR_LINK

EVENT

REFERRAL

CAMPAIGN

SPONSORED_MISSION

SHARE_LINK

DIRECT

The context should be stored server-side or represented through a signed/opaque identifier whose contents cannot be modified by the browser.

Do not trust mutable client fields for financially meaningful attribution.

An attribution record should be able to contain concepts such as:

* attribution ID
* originating creator
* originating referral
* originating event
* campaign if already known
* source type
* first-touch timestamp
* last-touch timestamp
* session/account
* anonymous visitor/session identifier where appropriate
* expiration
* attribution rule version
* status
* evidence
* converted/used state where relevant

Improve this model if a stronger design is appropriate.

---

# 5. ATTRIBUTION SECURITY

Attribution must protect against:

* manually changing creator IDs
* manually changing handles
* self-attribution abuse
* advertiser attribution abuse
* duplicate attribution claims
* expired attribution contexts
* cross-account manipulation
* replay
* campaign mismatch
* referral loops
* creator claiming their own participant activity where prohibited

Use:

* opaque identifiers
* signed tokens where appropriate
* server-side lookup
* expiry
* ownership checks
* idempotency
* audit records

Never let creator financial/reward attribution depend solely on a browser-provided username.

---

# 6. ATTRIBUTION POLICY

Create configurable versioned attribution policies.

Prepare for rules such as:

* first touch
* last eligible touch
* creator-origin priority
* referral priority
* event-origin attribution
* campaign-specific overrides
* attribution windows
* conversion windows

Do NOT invent complicated marketing attribution unnecessarily.

Implement a clear conservative initial policy and document it.

The rule must be reproducible historically.

Finalized economic history must not change because attribution rules later change.

---

# 7. ANONYMOUS → AUTHENTICATED ATTRIBUTION

A visitor may arrive at a Ruvora creator profile before registering.

Preserve legitimate attribution when the visitor later:

* registers
* logs in
* joins an Event
* starts an opportunity
* completes eligible activity

Design privacy-conscious anonymous attribution.

Do NOT use invasive fingerprinting.

Prefer:

* short-lived secure cookies
* opaque attribution IDs
* server-side records
* session association

On login/registration, attribution may be safely associated with the authenticated account according to documented rules.

---

# 8. CREATOR MONETIZATION LOOP

Build a complete vertical slice around creator-originated traffic.

A creator must be able to understand:

* how many visitors arrived through their Ruvora Link
* how many visitors engaged with eligible opportunities
* how many produced validated advertising activity
* how many became Ruvora users
* how much validated creator RU was produced
* what monetary allocations were eventually earned
* which campaigns/events drove results

Create creator analytics for:

* profile views
* attributable sessions
* campaign starts
* validated actions
* conversions where available
* RU generated
* pending RU
* rejected activity
* Event participation
* referrals
* revenue allocation history

Avoid vanity analytics that cannot be backed by actual records.

---

# 9. RUVORA LINK MONETIZATION MODULES

Improve the public profile so creators can surface:

* featured sponsored opportunity
* active Ruvora Event
* current Challenge
* recommended campaign
* creator referral CTA
* creator achievements
* selected links
* social destinations

Creators should eventually be able to control the order/visibility of supported profile modules.

Do not allow arbitrary unsafe HTML.

Use safe predefined blocks/components.

---

# 10. SHARE LINKS

Create shareable tracked links for eligible surfaces.

Examples conceptually:

creator profile share

event share

campaign opportunity share

creator challenge share

referral share

Do not expose raw internal IDs unnecessarily.

Use short opaque identifiers/slugs where appropriate.

All share links must resolve safely and preserve valid attribution.

---

# 11. REFERRAL ENGINE — REAL IMPLEMENTATION

Upgrade referrals from foundation to working vertical slice.

Support at minimum:

* user referral
* creator referral
* advertiser referral architecture

Referrals must be:

* bounded
* configurable
* auditable
* anti-self-referral
* anti-loop
* tied to legitimate activity

Do NOT implement multi-level pyramid compensation.

Initial design should preferably remain one-level direct referral.

Referral RU may only derive from explicit legitimate eligible rules.

A referral must not automatically create monetary value merely because a user registered.

---

# 12. VIRAL GROWTH ANALYTICS

Create admin growth metrics for:

* public Ruvora profile visits
* profile → registration conversion
* referral conversion
* creator-attributed registration
* event shares
* event joins from share links
* share → registration conversion
* active creators publishing Ruvora links
* creator link performance
* campaign traffic by origin

Build metrics from real stored events.

Do not generate fake analytics.

---

# 13. EVENT ENGINE — PASS 02 EXPANSION

Events must become a serious monetization/growth feature.

Expand the current Event Engine to support:

* platform-created Events
* advertiser-sponsored Events
* creator-hosted Events where policy allows
* campaign-linked Events
* seasonal Events

Event lifecycle should include robust states such as:

DRAFT

PENDING_REVIEW

SCHEDULED

ACTIVE

PAUSED

COMPLETED

SETTLING

SETTLED

CANCELLED

REJECTED

Improve naming if necessary.

---

# 14. EVENT CREATION

Create functional Event creation.

Support:

* title
* localized description
* artwork
* start/end
* participant eligibility
* associated campaign(s)
* sponsor
* Event Point rules
* milestones
* leaderboard logic
* reward tiers
* optional RU bonus budget
* optional monetary prize pool
* participant cap where needed
* geography/policy
* anti-abuse settings
* visibility
* share settings

Admin review should be configurable.

---

# 15. ADVERTISER-SPONSORED EVENTS

Advertisers must be able to sponsor Events.

A sponsored Event may include:

* media campaign budget
* separate Event prize budget
* sponsor branding
* linked campaign
* challenge objective
* Event artwork
* Event landing page
* leaderboard
* Event rewards

The advertiser must be able to see:

* participants
* validated activity
* campaign spend
* Event Point activity
* conversions where available
* invalid traffic
* Event performance
* prize liability
* Event settlement state

---

# 16. EVENT PRIZE POOL ACCOUNTING

This is financially critical.

Prize pool money must NOT be represented as a UI-only number.

Implement actual ledger-backed accounting.

Keep strict separation between:

* advertiser available balance
* campaign media budget
* Event prize pool
* platform revenue
* Global Distribution Pool
* payout liabilities

Conceptual flow:

advertiser balance

→ reserve/fund Event prize pool

→ Event liability account

→ Event completes

→ settlement eligibility finalized

→ deterministic winner allocation

→ participant liabilities/balances

Any unused funds should follow explicit documented rules:

* return to advertiser
* retain if contractually configured
* alternative configured behavior

Do not invent hidden platform retention.

Make rules explicit.

---

# 17. PRIZE POOL SAFETY

Before Event activation:

* confirm prize funding
* confirm Event rules
* confirm reward structure
* confirm sponsor authorization
* validate dates
* validate geography/policy
* ensure maximum liability is known

Do not allow an Event to promise an unfunded prize.

Create explicit states around:

UNFUNDED

FUNDED

LOCKED

SETTLING

SETTLED

REFUNDED

or equivalent.

---

# 18. EVENT SETTLEMENT

Create deterministic settlement.

The settlement process must:

1. freeze eligible Event activity
2. resolve reversals/invalid activity
3. freeze final leaderboard
4. compute winners
5. compute RU bonuses if configured
6. compute monetary prize allocations
7. generate ledger transactions
8. mark settlement records immutable where appropriate
9. retain rule version
10. emit audit records

Use idempotency.

Running settlement twice must not duplicate rewards.

---

# 19. LEADERBOARD INTEGRITY

Leaderboards must derive from Event Point entries.

Do not treat a cached score as ultimate source of truth.

Support:

* deterministic aggregation
* ties
* configured tie-breaking
* disqualified participants
* reversed activity
* suspended accounts
* frozen final rankings

Document tie-breaking rules.

---

# 20. EVENT ANTI-FRAUD

Add Event-specific protections:

* repeated-action abuse
* creator self-farming
* sponsor self-farming
* duplicate participation
* suspicious account clusters where detectable without invasive fingerprinting
* abnormal Event Point velocity
* invalid campaign activity
* referral abuse

Suspicious rewards may remain pending.

Do not silently delete history.

---

# 21. EVENT VISUAL UPGRADE

Events are viral assets.

Give Event pages a stronger premium identity.

Preserve the canonical Ruvora visual universe.

Use existing canonical Ruvora assets where appropriate.

If GPT Image generation is available, create only purposeful Event artwork that remains within the existing Ruvora art direction.

Do NOT regenerate the entire brand identity.

Do NOT replace canonical Ruvora orbs.

Consult `VISUAL_ASSET_MANIFEST.md`.

Event pages should clearly showcase:

* Event name
* sponsor
* prize pool
* participant count
* time remaining
* current user rank
* current score
* milestones
* leaderboard
* Event rules
* CTA/share

The page must remain excellent on mobile.

---

# 22. SOCIAL SHARE CARDS

Build share-card infrastructure for:

* creator profile
* Event
* achievement
* milestone

Social cards should look premium.

Use actual Ruvora branding.

Generate cards dynamically where technically sensible.

Include safe dynamic text and canonical artwork.

Avoid generating a new AI image for every share event.

---

# 23. CREATOR CAMPAIGN DISCOVERY

Improve creator campaign discovery.

Creators should be able to identify campaigns/events relevant to:

* creator tier
* geography
* category
* audience
* eligibility
* campaign status

Create safe filters and eligibility logic.

Do not expose campaigns a creator is not eligible to use.

---

# 24. CREATOR-AUDIENCE ATTRIBUTION

When a visitor enters through a creator's Ruvora Link and participates in an eligible campaign:

creator attribution must be recorded from the trusted attribution context.

Do NOT accept `creatorHandle` from the client as financial truth.

This is a permanent invariant.

Add automated tests specifically proving that forged creator attribution is rejected.

---

# 25. ADVERTISER RU — HARDENING

Preserve the Pass 01 rule:

Advertisers gain RU from legitimate validated delivered activity.

NOT from simply funding campaigns.

Add tests covering:

* deposit only → 0 advertiser RU
* campaign funding only → 0 advertiser RU
* invalid click → 0 advertiser RU
* rejected conversion → 0 advertiser RU
* valid eligible activity → expected advertiser RU
* reversed activity → advertiser RU reversal where applicable

---

# 26. CREATOR RU — HARDENING

Creator RU must derive from legitimate attributable economic activity.

Test:

* direct activity with no creator attribution
* creator-attributed valid activity
* forged creator attribution
* expired attribution
* creator self-attribution
* advertiser self-attribution
* reversed underlying activity
* suspended creator
* attribution outside configured window

---

# 27. RULE VERSIONING

Any new economic rule introduced in this pass must be versioned where historical reproducibility matters.

This includes:

* attribution policy
* creator RU coefficients
* referral RU rules
* Event Point rules
* Event settlement rules
* prize distribution rules

Finalized historical results must remain explainable.

---

# 28. FINANCIAL HARDENING

Audit every new financial path.

Use:

* ledger-backed movement
* idempotency
* serializable or appropriately safe transactions
* row locks where necessary
* database constraints
* explicit state machines
* immutable settlement records where appropriate

Never mutate balances directly.

Never duplicate ledger credits because of retries.

---

# 29. REVERSALS

Ensure reversals work across:

advertising activity

→ user RU

→ creator RU

→ advertiser RU

→ Event Points

→ Event eligibility

→ monetary allocations where still reversible

Do not allow reversal logic to corrupt already-finalized legally/accountingly settled periods.

Where finalized distributions cannot be rewritten, use compensating entries.

Document behavior.

---

# 30. PAYMENT PROVIDER ARCHITECTURE

Do not necessarily integrate a real payment provider unless credentials/configuration are available.

But make the architecture ready.

Create/complete provider interfaces for:

* advertiser deposits
* payment confirmation
* refunds
* chargebacks
* payouts

Use a proper sandbox/development adapter.

No fake "production payment success."

---

# 31. WEBHOOK INFRASTRUCTURE

Create robust external callback/webhook foundations.

Requirements:

* signature verification abstraction
* idempotency
* event storage
* replay protection
* retry handling
* explicit processing state
* safe logs
* dead-letter/failure inspection where practical

Potential future webhook sources:

* payment provider
* conversion provider
* email provider
* identity/KYC provider

---

# 32. CONVERSION CALLBACKS

Build a provider-neutral server-to-server conversion event architecture.

A conversion callback must support:

* campaign
* click/activity correlation
* external conversion ID
* amount/value where allowed
* event timestamp
* signature/provider verification
* idempotency
* validation
* rejection
* reversal

Never trust unauthenticated conversion callbacks.

---

# 33. EMAIL ACCOUNT SECURITY

Complete production-ready architecture for:

* email verification
* password reset
* login notifications if appropriate
* sensitive-account-change notifications

If no real email provider credentials are available:

use a development provider and keep production adapter boundaries clean.

Do not log secrets or password-reset tokens.

---

# 34. MFA / ADMIN SECURITY

Add stronger admin security.

Implement or prepare:

* MFA/TOTP for ADMIN
* re-authentication for critical actions
* session revocation
* login audit trail

Require stronger checks for:

* distribution finalization
* Event prize settlement
* economic configuration changes
* financial corrections
* high-risk account actions

If full two-person approval is too large for this pass, implement the data model/workflow foundation and document remaining work.

---

# 35. TWO-PERSON APPROVAL FOUNDATION

Prepare approval workflows for high-impact financial actions.

Examples:

* very large distribution
* manual ledger adjustment
* prize settlement override
* payout override
* economic rule change

Conceptual states:

REQUESTED

APPROVED

REJECTED

EXECUTED

EXPIRED

Requester should not be able to approve their own high-risk action.

Test this rule.

---

# 36. CREATOR ANALYTICS

Improve Creator Dashboard using real stored data.

Add useful metrics such as:

* Ruvora Link views
* attributed visitors
* attributed registrations
* campaign starts
* validated engagements
* conversion rate
* creator RU
* creator pending RU
* Event activity
* referral activity
* revenue allocations

Prefer simple useful charts over decorative analytics.

---

# 37. ADVERTISER ANALYTICS

Improve advertiser analytics.

Support:

* spend
* validated events
* rejected events
* invalid traffic rate
* qualified views
* clicks
* conversions
* cost metrics where data allows
* advertiser RU
* Event performance
* creator-source performance
* conversion source

Do not invent performance data.

---

# 38. ADMIN ECONOMIC ANALYTICS

Improve the admin profitability/economy cockpit.

Add views for:

* gross campaign revenue
* validated billable activity
* revenue awaiting settlement
* prize liabilities
* pool liability
* creator liabilities
* payout liabilities
* retained platform revenue
* estimated infrastructure input
* estimated operating contribution
* monthly net target progress

Keep estimates clearly distinguished from finalized accounting facts.

---

# 39. MARGIN GOVERNOR HARDENING

Ensure sponsored Events and prize liabilities are included in economic safety.

The Margin Governor must consider at minimum:

* Global Distribution Pool
* campaign liabilities
* Event prize liabilities
* user/creator liabilities
* fees
* reserves
* retained-margin requirements

Prevent economic actions that violate configured safety rules.

Add tests.

---

# 40. MOBILE-FIRST VIRAL UX

Ruvora will receive substantial traffic from mobile social apps.

Audit carefully:

* Ruvora public profiles
* Event pages
* campaign opportunity pages
* share flows
* onboarding
* creator analytics

Mobile UX must feel like the primary interface.

No clipped hero artwork.

No tiny desktop tables.

No broken sticky components.

No horizontal overflow.

---

# 41. VISUAL POLISH — PRESERVE PASS 01 IDENTITY

Pass 01 established a strong Ruvora design system.

DO NOT redesign the product from scratch.

Preserve:

* canonical orb family
* warm luxury futurism
* material language
* typography philosophy
* artwork coherence
* dark premium foundation
* gold / amber / copper / coral energy

Improve:

* dashboard hierarchy
* analytics visualization
* Event pages
* profile monetization modules
* share surfaces
* empty states
* micro-interactions
* responsive polish

---

# 42. GPT IMAGE RULE

Consult the existing visual manifest before creating any new images.

If GPT Image generation is available:

only create new visuals when genuinely needed.

Prioritize:

* sponsored Event key art
* share-card base artwork if required
* missing major campaign surfaces

Do NOT regenerate:

* canonical Ruvora hero
* canonical Ruvora orb family
* existing successful brand assets

Reuse existing visual assets consistently.

If the exact GPT Image model selector is not available, document the limitation honestly.

Never claim a specific model version unless actually confirmed.

---

# 43. PERFORMANCE

Attribution and analytics must not make public pages slow.

Watch for:

* unnecessary synchronous analytics writes
* N+1 queries
* excessive JS
* giant images
* expensive dashboard queries

Use batching/background jobs where justified.

Do not sacrifice correctness.

---

# 44. PRIVACY

Attribution must remain privacy-conscious.

Do NOT add invasive cross-site tracking.

Do NOT fingerprint devices unnecessarily.

Use minimum data required for:

* fraud prevention
* attribution
* security
* analytics

Prepare retention policies for attribution/event data.

Document privacy-sensitive choices.

---

# 45. ABACUS DEPLOYMENT READINESS

Improve `DEPLOYMENT_ABACUS.md`.

The project should eventually be straightforward for Abacus AI / SuperComputer to deploy.

Document:

* Node version
* pnpm version
* required environment variables
* PostgreSQL requirements
* Redis requirements if now used
* migration command
* seed command
* build command
* start command
* health endpoint
* readiness endpoint
* production vs development config
* storage requirements
* generated-asset storage
* background worker requirements
* cron/scheduled job requirements
* webhook public endpoints
* secrets that must be configured

Expected environment concept:

Production:
`app.ruvora.com`

Development/Staging:
`dev.ruvora.com`

Do not hard-code domains.

---

# 46. STAGING / PRODUCTION SAFETY

Ensure the application can clearly distinguish:

DEVELOPMENT

STAGING

PRODUCTION

Prevent production from:

* loading demo seed data automatically
* using dev payment providers
* exposing debug routes
* exposing test logins
* logging secrets
* running unsafe seed/reset scripts

Add environment guards.

---

# 47. DATABASE MIGRATION QUALITY

Do not rewrite historical migrations casually.

Create forward migrations.

Ensure:

* clean new database migration works
* migration from Pass 01 schema works
* indexes exist for new attribution/event queries
* financial constraints remain intact

Where possible test migration on:

1. clean database
2. seeded Pass 01-style database

---

# 48. TEST EXPANSION

Preserve all existing tests.

Do not reduce coverage to make new code pass.

Add meaningful tests for this pass.

High-priority new tests:

## Attribution

* creator profile creates valid attribution
* forged creator attribution rejected
* expired attribution rejected
* anonymous attribution survives registration where eligible
* self-attribution rejected
* referral loop rejected
* attribution policy version preserved

## Creator RU

* legitimate creator-attributed activity creates creator RU
* no attribution creates no creator RU where policy requires attribution
* reversed activity reverses eligible creator RU

## Advertiser RU

* deposit alone creates none
* funding alone creates none
* valid activity creates RU
* invalid activity creates none
* reversed activity handled correctly

## Event Prize Pool

* cannot activate unfunded prize
* funding creates correct ledger transaction
* settlement balances
* settlement is idempotent
* second settlement does not double-pay
* cancelled Event refunds correctly according to rules
* final leaderboard frozen
* reversal before settlement affects ranking

## Margin Governor

* prize liability included
* unsafe settlement blocked
* safe settlement allowed

## Referral

* valid referral
* self-referral blocked
* loop blocked
* duplicate conversion idempotent

## Security

* admin MFA flow
* unauthorized settlement blocked
* requester cannot self-approve high-risk operation
* webhook signature failure rejected
* webhook replay handled

---

# 49. CONCURRENCY TESTS

Financial and event logic requires concurrency testing.

Add PostgreSQL integration/concurrency tests around:

* simultaneous conversion callbacks
* simultaneous activity validation
* simultaneous prize settlement attempts
* simultaneous distribution finalization
* simultaneous use of attribution context where one-time constraints exist
* simultaneous refund/reversal vs settlement
* duplicate webhook delivery

Ensure correct locking/idempotency.

---

# 50. E2E / BROWSER TESTS

Expand browser coverage where practical.

Important journeys:

## Creator Viral Loop

visitor opens creator profile

→ chooses opportunity

→ attribution created

→ signs up/logs in

→ performs test eligible activity

→ creator receives correct attribution result

## Sponsored Event

advertiser creates/sponsors Event

→ funding recorded

→ Event activated

→ participant joins

→ activity validated

→ leaderboard updates

→ Event settles

→ prize allocation visible

## Share Loop

user shares Event/profile

→ new visitor opens shared link

→ attribution/referral preserved

## Mobile

Repeat important public profile and Event journeys at mobile widths.

---

# 51. DOCUMENTATION

Update all affected documents.

Create new documentation where appropriate, especially:

`ATTRIBUTION_ENGINE.md`

`REFERRAL_ENGINE.md`

`EVENT_SETTLEMENT.md`

`WEBHOOKS.md`

`PROVIDERS.md`

Update:

`PROJECT_MEMORY.md`

`ARCHITECTURE.md`

`PRODUCT.md`

`ECONOMY.md`

`RU_ENGINE.md`

`EVENT_ENGINE.md`

`ADVERTISING_ENGINE.md`

`LEDGER.md`

`MARGIN_GOVERNOR.md`

`FRAUD_AND_RISK.md`

`SECURITY.md`

`VISUAL_ASSET_MANIFEST.md`

`DEPLOYMENT_ABACUS.md`

`ROADMAP.md`

`CHANGELOG.md`

`RELEASE_REPORT.md`

---

# 52. DO NOT FAKE EXTERNAL SERVICES

If real credentials are unavailable:

do not fake a Stripe/PayPal/etc. production integration.

do not claim real email was sent.

do not claim KYC was executed.

do not claim social follower verification is live.

Instead:

implement clean provider interfaces

*

a clearly-labelled development adapter.

---

# 53. DO NOT BREAK WHAT ALREADY WORKS

Before completion verify no regression in:

* homepage
* public profile
* authentication
* multi-role permissions
* campaigns
* RU
* XP
* Event Points
* ledger
* Global Distribution Pool
* Margin Governor
* EN/FR
* responsive design
* existing tests

If a refactor is required:

prove why it is necessary.

---

# 54. RELEASE STANDARD

Pass 02 should move Ruvora closer to:

# PRE-PRODUCTION

not merely "more features."

At the end, classify honestly:

PROTOTYPE

DEVELOPMENT

PRE-PRODUCTION

PRODUCTION CANDIDATE

Do NOT call it production-ready while important real-money/provider/compliance limitations remain.

---

# 55. FINAL VALIDATION

Before completion:

* install clean dependencies
* lint
* typecheck
* run unit tests
* run PostgreSQL integration tests
* run concurrency tests
* run production build
* run clean migrations
* run upgrade migrations from existing schema
* run seed
* run browser tests
* inspect browser console
* inspect server logs
* inspect mobile
* inspect desktop
* test EN
* test FR
* test creator attribution
* test advertiser RU
* test Event funding
* test Event settlement
* test reversals
* test webhook idempotency
* test admin authorization
* test Margin Governor
* test Global Distribution Pool regression

Fix discovered problems.

---

# 56. FINAL RELEASE REPORT

Create a detailed updated `RELEASE_REPORT.md`.

Report:

1. Repository state before Pass 02
2. What was changed
3. Attribution Engine implementation
4. Attribution security model
5. Creator Monetization Loop
6. Ruvora Link changes
7. Creator RU changes
8. Advertiser RU hardening
9. Referral Engine
10. Viral/share infrastructure
11. Event creation
12. Sponsored Events
13. Event Prize Pool accounting
14. Event settlement
15. Leaderboard integrity
16. Event fraud controls
17. Financial/ledger changes
18. Margin Governor changes
19. External provider architecture
20. Webhooks
21. Email/security changes
22. MFA/admin hardening
23. Approval workflow
24. Creator analytics
25. Advertiser analytics
26. Admin profitability analytics
27. Visual improvements
28. GPT Image assets newly generated, if any
29. Responsive validation
30. Database migrations
31. Tests added
32. Exact test results
33. Concurrency validation
34. Browser/E2E validation
35. Known limitations
36. External services still simulated
37. Remaining compliance work
38. Remaining technical debt
39. Current release classification
40. Recommended Pass 03
41. Exact Abacus deployment readiness
42. Exact commands to deploy/test locally
43. Git branch / commits / PR

Be completely honest.

Do not claim external integrations or validation that did not occur.

---

# 57. PRODUCT ACCEPTANCE QUESTION

At completion, answer this explicitly:

> Can a creator place their Ruvora Link in a social bio, receive visitors, have those visitors participate in eligible Ruvora activity, and receive trustworthy server-controlled attribution and economically valid creator credit without the participant being able to forge the creator attribution?

If NO:

Pass 02 is not complete.

---

# 58. EVENT ACCEPTANCE QUESTION

Answer explicitly:

> Can an advertiser fund a separate sponsored Event prize pool, users participate through validated activity, the Event produce a deterministic final leaderboard, and the system settle the funded prize through the financial ledger exactly once?

If NO:

Pass 02 is not complete.

---

# 59. FINANCIAL ACCEPTANCE QUESTION

Answer explicitly:

> Can the new Pass 02 economic flows survive retries, duplicate webhook/event delivery, reversals and concurrent execution without silently duplicating money, RU or prizes?

If NO:

Pass 02 is not complete.

---

# 60. FINAL EXECUTION PRINCIPLE

Do not maximize feature count.

Maximize the number of COMPLETE trustworthy loops.

The most important Pass 02 loop is:

# RUVORA LINK

↓

# TRUSTED ATTRIBUTION

↓

# VALIDATED ACTIVITY

↓

# ADVERTISER VALUE

↓

# USER + CREATOR + ADVERTISER RU

↓

# CREATOR ANALYTICS

↓

# REVENUE DISTRIBUTION

The second critical loop is:

# SPONSORED EVENT

↓

# FUNDED PRIZE POOL

↓

# VALIDATED PARTICIPATION

↓

# EVENT POINTS

↓

# FINAL LEADERBOARD

↓

# DETERMINISTIC SETTLEMENT

↓

# LEDGER CREDIT

Build those two loops extremely well.

Do not sacrifice correctness for scope.

Do not sacrifice visual quality.

Do not weaken the Pass 01 financial architecture.

Do not replace canonical Ruvora design assets.

Move Ruvora from an impressive foundation toward a serious pre-production platform.
