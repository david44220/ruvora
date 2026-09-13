# RUVORA — MASTER PRODUCTION BUILD

You are the principal engineer, product architect, product designer, security engineer and technical lead responsible for building the first serious production-oriented implementation of **Ruvora**.

This is not a throwaway prototype.

This is not a generic SaaS dashboard.

This is not a simple paid-to-click application.

Build the foundation of the real product.

Use strong engineering judgment and work autonomously.

Do not repeatedly stop for minor decisions. When implementation details are open, choose the safest, most maintainable and production-oriented solution, document the decision and continue.

---

# 0. OFFICIAL PRODUCT IDENTITY

The official product name is:

# RUVORA

Ruvora is a completely independent project.

It has absolutely no relationship to:

* Naxa
* Daxa
* Vexa
* Exa
* or any other existing or previous ecosystem

Do not reuse their:

* naming
* currencies
* branding
* logos
* assets
* economic concepts
* design language
* source code

Ruvora must develop its own strong identity.

---

# 1. CORE PRODUCT MISSION

Ruvora is an independent platform combining:

* social monetization
* creator economy
* advertising
* gamification
* Reward Units
* revenue sharing
* sponsored events
* viral public profiles
* link-in-bio functionality
* referrals
* achievements
* quests
* advertiser participation

The core idea is:

> **Turn your social presence into an economy.**

A second major positioning statement is:

> **Monetize your audience. From follower #10.**

Ruvora exists independently from the social networks themselves.

A creator should not need thousands of followers or platform-specific monetization approval before gaining access to monetization tools.

The initial creator eligibility threshold should be configurable, with an initial default around:

**10 followers**

This means access to creator monetization features.

It must NEVER be presented as guaranteed income.

Actual earnings depend on:

* eligible advertising campaigns
* legitimate audience activity
* validated events
* advertiser budgets
* creator performance
* platform economics
* fraud checks
* policy eligibility
* geographical/legal availability

---

# 2. BUSINESS OBJECTIVE

Ruvora is intended to become an independent profitable business that helps finance the software studio through operating revenue.

The first internal financial milestone is:

**approximately €500–€600 monthly NET operating profit minimum**

after taking into account:

* creator allocations
* user allocations
* advertiser allocations
* revenue-sharing distributions
* payment-provider costs
* refunds
* chargebacks
* fraud losses
* event prize liabilities
* infrastructure
* other direct operating expenses

This is an internal business objective.

It is NOT marketing copy.

Do not hard-code €500 or €600 into application logic.

Create configurable operating-profit targets.

Ruvora must eventually be capable of scaling far beyond this initial milestone.

---

# 3. PRODUCT VISION

Ruvora should become:

> **the ultimate independent monetization and gamification layer for social networks.**

Ruvora links should eventually become common in:

* Instagram bios
* TikTok profiles
* YouTube descriptions
* Twitch profiles
* X profiles
* Discord communities
* creator websites
* personal websites
* newsletters
* gaming communities
* small niche communities
* nano-influencer profiles
* micro-influencer profiles

The product must be intrinsically viral.

Every creator using Ruvora should naturally expose Ruvora to their own audience.

---

# 4. RUVORA LINK — CORE VIRAL PRODUCT

One of the most important product surfaces is the public Ruvora profile.

Each eligible account should be able to own a unique handle:

`ruvora.com/@username`

The Ruvora Link must be much more powerful than a conventional link-in-bio page.

It should become the creator's:

* social hub
* monetization hub
* campaign hub
* community page
* challenge page
* rewards page
* event page
* referral entry point

A public Ruvora profile may include:

* avatar
* display name
* biography
* creator category
* creator level
* social accounts
* audience information
* verified/unverified status
* custom external links
* achievements
* selected badges
* active campaigns
* sponsored opportunities
* active events
* creator challenges
* referral CTA
* share controls
* creator statistics where public
* configurable visual theme later

Support URLs such as:

`ruvora.com/@username`

and referrals such as:

`ruvora.com/r/username`

and direct event URLs.

Create proper:

* canonical URLs
* Open Graph metadata
* social previews
* share metadata

The Ruvora Link experience must be exceptional on mobile.

---

# 5. VIRAL PRODUCT LOOPS

Build the architecture with explicit viral loops in mind.

## Creator Loop

Creator creates Ruvora account.

↓

Creator receives public Ruvora Link.

↓

Creator places it in social profiles.

↓

Followers visit.

↓

Followers discover creator content, opportunities, challenges and events.

↓

Some visitors become Ruvora participants.

↓

Some eventually create their own Ruvora profiles.

↓

More Ruvora links appear across the social web.

---

## Event Loop

Creator or platform promotes a Ruvora Event.

↓

Users join through shareable links.

↓

Validated activity generates Event Points.

↓

Leaderboard creates competition.

↓

Participants share the event.

↓

More participants join.

---

## Advertiser Loop

Advertisers may sponsor branded challenges or events.

Those event links themselves advertise:

* the advertiser
* the creator
* Ruvora

---

## Referral Loop

Users and creators may refer legitimate participants.

Referrals must be bounded, transparent and resistant to abuse.

Do NOT build uncontrolled pyramid-style compensation.

---

# 6. TARGET CREATOR SEGMENTS

Ruvora must strongly support smaller creators.

Suggested configurable creator tiers:

* Nano
* Micro
* Emerging
* Established
* Large

Example concept:

Nano creators may begin around 10 followers.

Do not make follower counts the primary financial truth.

Ruvora should value:

* legitimate activity
* conversion quality
* real engagement
* verified advertising outcomes
* audience quality

A highly engaged creator with 50 legitimate followers may be more valuable than an account with thousands of artificial followers.

---

# 7. DEVELOPMENT AND GITHUB RULES

GitHub is the canonical source of truth.

All important architecture and documentation must live in the repository.

Preferred branch strategy:

`main`
→ production candidate / stable

`develop`
→ staging / integration

`feature/*`
→ new work

`hotfix/*`
→ critical production fixes

When repository access is available:

* work on a dedicated branch
* commit coherent changes
* maintain clean history where practical
* never rewrite unrelated working code
* never push unfinished unsafe changes directly to production branches

Future coding agents must be able to understand the project directly from the repository.

---

# 8. TARGET DEPLOYMENT MODEL

Development will initially be performed through coding agents.

The repository will later be deployed and operated through **Abacus AI infrastructure / SuperComputer**.

Expected environments:

PUBLIC WEBSITE

`ruvora.com`

PRODUCTION APPLICATION

`app.ruvora.com`

DEVELOPMENT / STAGING

`dev.ruvora.com`

Do NOT hard-code these domain names into business logic.

Use environment configuration.

The application must remain portable.

Core business logic must NOT depend unnecessarily on proprietary Abacus-specific functionality.

Abacus should be able to:

* clone the repository
* install dependencies
* provide environment variables
* provision/connect PostgreSQL
* run migrations
* build the application
* run tests
* deploy the application

without rewriting the architecture.

---

# 9. PREFERRED TECHNICAL STACK

Use the latest stable versions reasonably supported by the development and deployment environments.

Preferred architecture:

* Next.js
* TypeScript
* PostgreSQL
* Prisma ORM
* Tailwind CSS
* reusable design-system architecture
* Node.js LTS
* pnpm
* Docker
* Docker Compose

Redis may be introduced later or now only when clearly justified for:

* queues
* distributed locks
* caching
* background jobs
* rate limiting

Do not introduce unnecessary infrastructure for architectural fashion.

Start with a:

# MODULAR MONOLITH

Do NOT prematurely create microservices.

Maintain strong domain boundaries so selected modules may eventually be extracted if scale requires it.

---

# 10. REPOSITORY QUALITY

Provide at minimum:

`.env.example`

production Dockerfile

Docker Compose development configuration

database migration strategy

database seed strategy

health endpoint

readiness endpoint

startup documentation

build command

test command

lint command

typecheck command

Never commit production secrets.

A clean clone should be reproducible.

---

# 11. DOMAIN ARCHITECTURE

Organize the project into coherent domains/modules.

Suggested domains:

* Identity
* Users
* Creators
* Advertisers
* PublicProfiles
* Campaigns
* Advertising
* Engagement
* ValidatedActivity
* RewardUnits
* XP
* Events
* EventPoints
* Quests
* Achievements
* Referrals
* Wallet
* Ledger
* RevenueShare
* MarginGovernor
* Analytics
* TrustAndSafety
* Risk
* Policy
* Notifications
* Administration
* Localization
* Configuration
* Audit

Avoid:

* giant route handlers
* giant React components
* giant utility files
* circular dependencies
* business logic embedded in UI components

Financial and economic logic must live in explicit domain services.

---

# 12. USER ROLES

Support multi-role accounts.

Primary roles:

USER

CREATOR

ADVERTISER

ADMIN

One account may hold multiple roles.

Examples:

a creator may also advertise

an advertiser may also use Ruvora normally

an admin may have internal testing roles

Do not model this as one mutually exclusive role column.

Use robust authorization.

Sensitive permissions must be checked server-side.

Hiding UI elements is NOT authorization.

---

# 13. SOCIAL NETWORK INDEPENDENCE

Ruvora is independent from social networks.

Do not rely on:

* unauthorized scraping
* fragile unofficial APIs
* abusive automation
* fake social verification

Allow creators initially to add:

* social profile URL
* platform name
* follower count
* audience information

Until trusted APIs/connectors are added, distinguish clearly between:

* self-declared audience data
* manually reviewed data
* externally verified data

Never label self-declared information as externally verified.

Build a provider-neutral connector abstraction for future social integrations.

---

# 14. THE FOUR ECONOMIC CONCEPTS

This separation is permanent and non-negotiable.

Never merge these four concepts.

---

## A. MONEY

Money represents actual monetary accounting.

Examples:

* advertiser deposits
* campaign spend
* platform revenue
* user allocations
* creator allocations
* advertiser rewards
* referrals
* event prizes
* refunds
* provider fees
* payouts

All monetary changes must be ledger-backed.

Never mutate monetary balances directly.

Use exact integer minor units or exact decimal representations.

Never use floating point arithmetic for money.

---

## B. REWARD UNITS — RU

Reward Units are NOT money.

RU are NOT cryptocurrency.

RU have NO guaranteed fixed monetary value.

RU represent eligible validated contribution during a revenue-sharing period.

Possible RU participant classes include:

* users
* creators
* advertisers
* referrals
* explicit event bonuses

RU must originate from legitimate eligible validated activity.

Depositing money must NOT automatically produce final RU.

---

## ADVERTISER RU RULE

Advertisers may earn Reward Units based on advertising activity that was genuinely delivered and validated.

Conceptual flow:

advertiser funds campaign

↓

campaign serves legitimate activity

↓

eligible user interaction occurs

↓

activity enters validation

↓

activity becomes validated/billable

↓

advertiser becomes eligible for corresponding advertiser RU

This may include eligible:

* qualified impressions
* validated views
* validated clicks
* validated conversions
* other configured campaign outcomes

Invalid, fraudulent, reversed or rejected activity must result in zero final RU.

Advertiser RU therefore reward **actual legitimate advertising distribution**, not simply spending or depositing money.

---

## RU LIFECYCLE

Prepare states such as:

PENDING

VALIDATED

REJECTED

CONSUMED

REVERSED

Economic records must not be destroyed silently.

Corrections must remain auditable.

RU calculations must be deterministic.

RU may support high-precision decimal values.

---

## C. XP

XP represents long-term account progression.

XP may influence:

* levels
* status
* achievements
* progression
* cosmetics
* feature unlocks

XP is not money.

XP is not RU.

---

## D. EVENT POINTS

Event Points exist only within a specific Event context.

They determine:

* ranking
* milestones
* leaderboards
* event progress

Event Points are not money.

Event Points are not RU.

One validated action may independently create:

`+40 XP`

`+15 Event Points`

`+0.25 RU`

These are three separate systems.

---

# 15. SINGLE GLOBAL DISTRIBUTION POOL

Ruvora should use a:

# GLOBAL DISTRIBUTION POOL

for periodic revenue sharing.

A configurable portion of eligible net platform revenue may be allocated to the pool.

The pool must support separate participant categories.

Example only:

Users: 40%

Creators: 30%

Advertisers: 20%

Referral ecosystem: 10%

DO NOT hard-code these percentages.

The administrator must control them.

This category system prevents one participant type from unintentionally consuming the allocation intended for another.

Within one category, a deterministic formula may use validated RU.

Conceptually:

participant distribution

=

category allocation

×

participant validated RU

/

total validated RU in that category

---

# 16. REVENUE DISTRIBUTION PERIODS

Support periodic distributions.

Potential schedules later:

* daily
* weekly
* monthly
* custom

Each distribution period must record:

* eligible revenue
* configured pool allocation
* participant category allocation
* rule version
* participant eligibility
* RU snapshot
* total RU by category
* participant RU
* calculated distribution
* preview
* finalized result
* resulting financial ledger entries

When finalized:

historical results must never silently change.

Economic rules must be versioned.

RU belonging to a finalized period may then be marked:

CONSUMED

and a new period begins.

---

# 17. MARGIN GOVERNOR

Implement the architecture for a serious:

# MARGIN GOVERNOR

Ruvora must never accidentally distribute more economic value than it can sustainably afford.

The Margin Governor should eventually account for:

* gross eligible advertising revenue
* provider fees
* taxes/configurable liabilities
* refunds
* chargebacks
* campaign liabilities
* user rewards
* creator rewards
* advertiser rewards
* referral allocations
* event liabilities
* prize pools
* infrastructure estimate
* operating reserve
* minimum retained margin
* Global Distribution Pool

Create configurable safety constraints.

The system should be capable of preventing or reducing a distribution when configured economic safety rules would be violated.

Such decisions must be auditable.

---

# 18. PROFITABILITY COCKPIT

Build or architect an administrator profitability view.

Eventually show:

* gross advertising revenue
* eligible revenue
* campaign spend
* platform fees
* payment fees
* refunds
* chargebacks
* creator allocations
* user allocations
* advertiser allocations
* referral allocations
* event liabilities
* distribution pool
* estimated infrastructure
* retained platform revenue
* estimated operating profit
* configured monthly target
* progress toward profitability target

Development values must be clearly identified as simulated/seeded.

---

# 19. ADVERTISING ENGINE

Create a serious campaign domain.

Advertisers should eventually be able to configure:

* campaign name
* campaign objective
* total budget
* daily budget
* start date
* end date
* creatives
* destination
* targeting
* pacing
* frequency caps
* reward configuration
* linked Ruvora Event
* sponsored prize pool if applicable

Prepare activity types such as:

IMPRESSION

QUALIFIED_VIEW

CLICK

CONVERSION

CREATOR_PROMOTION

SPONSORED_MISSION

Different campaign objectives may use different types.

Do not assume every campaign supports everything.

---

# 20. CAMPAIGN LIFECYCLE

Prepare states such as:

DRAFT

PENDING_REVIEW

ACTIVE

PAUSED

COMPLETED

REJECTED

ARCHIVED

Admin review requirements must be configurable.

---

# 21. ADVERTISING EVENT LIFECYCLE

Distinguish between:

event received

event eligible

event validated

event billed

event rewarded

event rejected

event reversed

These states must remain auditable.

---

# 22. VALIDATED ACTIVITY PIPELINE

Ruvora must reward validated legitimate activity, not raw clicks.

Create a validation pipeline.

Possible states:

RECEIVED

PENDING_VALIDATION

VALIDATED

REJECTED

REVERSED

Prepare validation signals including:

* authenticated participant
* campaign eligibility
* duplicate protection
* frequency limits
* campaign budget
* timing
* event sequence
* conversion evidence
* suspicious repetition
* velocity
* account trust
* campaign rules
* geo rules
* device/session security signals where privacy compliant

Do not build invasive tracking.

Fraud prevention must remain privacy-conscious.

---

# 23. TRUST AND SAFETY

Implement a serious baseline.

Prepare:

* risk events
* risk scores
* user flags
* creator flags
* advertiser flags
* campaign flags
* economic holds
* suspicious activity review
* invalid traffic
* duplicate activity prevention
* velocity limits
* rate limiting
* configurable thresholds
* admin review
* suspension mechanisms
* audit trail

Rewards generated from suspicious activity may remain pending.

Never silently remove financial history.

---

# 24. EVENT ENGINE

Events are a major product feature.

Events may eventually be:

* platform-created
* creator-created
* advertiser-sponsored
* campaign-specific
* community-specific
* seasonal

Support:

* event title
* description
* premium artwork
* start time
* end time
* rules
* eligibility
* linked campaigns
* sponsors
* Event Point rules
* participant count
* milestones
* leaderboard
* ranking
* reward tiers
* RU bonuses
* optional sponsored monetary prize pool
* status
* anti-abuse policy
* shareable URL
* social share card

Event Points must originate from validated eligible activity.

If underlying activity becomes invalid later, associated Event Points must support reversal.

---

# 25. EVENT REWARDS

Example:

Ruvora Creator Rush

Participants perform eligible validated campaign activity.

They gain:

XP

Event Points

normal eligible RU

At event completion, rankings may additionally receive:

* bonus RU
* achievements
* badges
* sponsored prizes

Example only:

1st → RU bonus

2nd → RU bonus

Top 100 → scaled bonus

or:

Sponsored Prize Pool → monetary prizes according to deterministic rules

Do not hard-code those examples.

---

# 26. SPONSORED PRIZE POOLS

Advertisers should eventually be able to sponsor Events.

Maintain strict accounting separation between:

* campaign media budget
* advertiser account balance
* event prize pool
* Global Distribution Pool
* platform retained revenue

Never mix liabilities.

Do not implement wagering.

Do not require paid entry in the initial product.

Do not create gambling mechanics.

Do not use casino terminology.

---

# 27. CREATOR ECONOMY

Creator functionality is central.

Creator Dashboard should support or prepare:

* Ruvora public profile
* social profiles
* audience overview
* creator tier
* monetization eligibility
* sponsorship opportunities
* campaigns
* sponsored missions
* Events
* creator-owned Events where enabled
* validated audience activity
* creator RU
* XP
* level
* achievements
* money balance
* earnings history
* referrals
* profile analytics
* public traffic
* conversion analytics

Nano creators must feel like first-class users.

---

# 28. NORMAL USER EXPERIENCE

User Dashboard should support:

* Overview
* Opportunities
* Quests
* Events
* Rewards
* Achievements
* Wallet
* Activity
* Referrals
* Settings

Important dashboard indicators:

* available balance
* pending balance
* validated RU
* pending RU
* XP
* level
* streak
* active quests
* achievements
* Event participation
* recent validated activity
* eligible opportunities
* referral performance

Never show fictional production earnings.

Seed data must be visibly development/demo data.

---

# 29. ADVERTISER EXPERIENCE

Advertiser Dashboard should eventually support:

* advertiser profile/organization
* campaign creation
* budget management
* creatives
* targeting
* campaign lifecycle
* spend
* validated activity
* invalid activity
* advertiser RU
* Event sponsorship
* sponsored prize pools
* analytics
* invoices
* financial activity
* conversion analytics

Build a real working vertical slice.

Do not build fake dashboard buttons.

---

# 30. REFERRAL ENGINE

Support referral attribution for:

* users
* creators
* advertisers

Do not create uncontrolled multi-level compensation.

Avoid pyramid-like financial mechanics.

Referral rewards must be bounded and configurable.

Economic referral rewards must derive from legitimate eligible platform activity.

Create anti-self-referral protection.

Referral RU must be distinguished from direct advertising RU.

---

# 31. QUEST ENGINE

Create reusable Quest infrastructure.

Potential quests:

* complete profile
* add social profile
* join first Event
* complete first validated campaign activity
* maintain streak
* invite legitimate participant
* reach creator milestone
* advertiser campaign milestone
* Event-specific objective

Possible rewards:

* XP
* Event Points
* badge
* cosmetic/status
* RU ONLY where economically eligible

Never allow arbitrary UI activity to create financially meaningful RU without a legitimate revenue source.

---

# 32. ACHIEVEMENTS

Create a premium achievement system.

Possible rarity model:

COMMON

RARE

EPIC

LEGENDARY

Use coherent visual treatment.

Achievements may be displayed on public profiles.

Do not create hundreds of meaningless badges.

---

# 33. FINANCIAL LEDGER

Financial integrity is critical.

Use append-only accounting principles.

Never trust cached displayed balances as source of truth.

Every important financial operation should originate from ledger transactions.

Provide:

* immutable transaction identifiers
* idempotency
* exact currency/amount handling
* transaction boundaries
* references to originating domain events
* timestamps
* account ownership
* audit context

Potential financial account categories:

PLATFORM

USER

CREATOR

ADVERTISER

CAMPAIGN

REVENUE_POOL

EVENT_PRIZE_POOL

PAYOUT

RESERVE

Improve this model if a stronger double-entry design is appropriate.

Document the accounting model thoroughly.

---

# 34. PAYMENTS AND PAYOUTS

Do not tightly couple the initial architecture to one payment provider.

Create provider interfaces.

Support future flows:

* advertiser funding
* payout request
* payout review
* payout processing
* payout failure
* refunds
* chargebacks

If no real payment credentials exist:

use a clearly labelled development provider.

Never fake live payment success.

---

# 35. GEO / AGE / COMPLIANCE POLICY ENGINE

Create centralized policy gating.

Features may eventually depend on:

* country
* region
* age
* role
* creator status
* advertiser status
* KYC
* KYB
* risk
* payment provider availability
* campaign
* legal availability
* feature flag

Do not scatter country-specific checks throughout the application.

Create a centralized policy mechanism.

Do not falsely claim legal certification or compliance.

---

# 36. AUTHENTICATION

Implement secure authentication.

Requirements:

* registration
* login
* logout
* password hashing
* email-verification architecture
* password-reset architecture
* secure sessions
* persistent login where safe
* session revocation
* multi-role support

Prepare future optional:

* passkeys
* social authentication

Do not expose secrets to the browser.

---

# 37. ONBOARDING

Create a premium progressive onboarding experience.

Initial paths:

**Earn & Participate**

**Monetize My Audience**

**Advertise**

Users may eventually use multiple paths.

Creator onboarding may include:

* handle
* avatar
* display name
* biography
* social URLs
* follower count
* creator category
* creator goals

Advertiser onboarding may include:

* organization name
* website
* industry
* campaign goals

Do not demand every field at registration.

Use progressive profiling.

---

# 38. INTERNATIONALIZATION

English is default.

French must be fully supported from the beginning.

No careless hard-coded user-facing text.

Use centralized i18n.

Architecture must support additional languages later.

Requirements:

* EN
* FR
* manual switch
* persisted preference
* layout resilient to longer translations

Do not ship partially translated major flows.

---

# 39. ADMINISTRATION

Create a real protected Admin area.

Admin should eventually support:

* users
* creators
* advertisers
* campaigns
* Events
* suspicious activity
* risk events
* economic holds
* feature flags
* policy rules
* Reward Unit rules
* XP rules
* Event Point rules
* pool allocation
* distribution periods
* Margin Governor
* financial overview
* profitability
* ledger inspection
* audit logs
* localization/configuration

Sensitive/destructive actions must be audited.

Prepare architecture for future two-person approval of high-risk financial operations.

---

# 40. CONFIGURATION OVER MAGIC CONSTANTS

Do NOT bury these values in source code:

* creator minimum followers
* RU coefficients
* XP coefficients
* Event Point coefficients
* Global Distribution Pool percentage
* pool category allocation
* referral rules
* campaign caps
* event reward rules
* payout thresholds
* risk thresholds
* Margin Governor thresholds
* feature availability
* policy conditions

Historical economic calculations must retain their versioned rule set.

---

# 41. DATABASE QUALITY

Design PostgreSQL carefully.

Use:

* foreign keys
* indexes
* unique constraints
* transaction boundaries
* robust timestamps
* immutable identifiers
* safe numeric types
* explicit state handling

Consider entities similar to:

users

profiles

roles

user_roles

sessions

creator_profiles

social_profiles

advertiser_accounts

advertiser_members

public_profiles

public_links

campaigns

campaign_creatives

campaign_targets

campaign_budgets

advertising_events

validated_activity

reward_rules

reward_unit_entries

xp_entries

events

event_point_entries

event_participants

event_sponsors

event_rewards

event_prize_pools

quests

quest_progress

achievements

user_achievements

referrals

wallet_accounts

ledger_transactions

ledger_entries

revenue_pool_periods

revenue_pool_categories

revenue_pool_snapshots

revenue_pool_participants

distribution_entries

risk_events

account_flags

audit_logs

feature_flags

policy_rules

notifications

platform_settings

economic_rule_versions

Do not blindly copy the list if better normalization exists.

Document important schema decisions.

---

# 42. SECURITY BASELINE

Implement defensive application security.

At minimum:

* robust input validation
* output encoding
* parameterized ORM queries
* SQL injection prevention
* CSRF protection where applicable
* secure cookies
* authentication rate limits
* API rate limits
* authorization
* secure headers
* secrets management
* safe upload design
* idempotency
* transaction safety
* production-safe error handling
* audit logs
* no secrets in client bundles

Do not implement offensive security tooling.

---

# 43. PRIVACY

Prepare a GDPR-conscious architecture.

At minimum consider:

* data minimization
* consent where technically required
* privacy settings
* data export
* account deletion workflow
* data retention
* pseudonymization where appropriate

Avoid invasive fingerprinting.

Do not claim legal certification.

---

# 44. DESIGN IS A CORE PRODUCT REQUIREMENT

Visual design is strategically important.

Ruvora must look:

# ABSOLUTELY EXCEPTIONAL

The experience must be:

* luxurious
* spectacular
* warm
* cinematic
* futuristic
* premium
* sophisticated
* energetic
* memorable
* desirable
* trustworthy
* highly polished

The immediate visitor reaction should be:

> **"I want my Ruvora link."**

Do NOT create:

* generic SaaS design
* ordinary admin template design
* cheap reward-app design
* stereotypical crypto design
* casino design
* random cyberpunk
* basic glassmorphism
* generic Three.js demos

---

# 45. OFFICIAL RUVORA VISUAL DIRECTION

Official direction:

# LUXURY WARM FUTURISM

Use a dark premium foundation.

Color family:

* Obsidian Black
* Deep Graphite
* Soft Charcoal
* Warm Ivory
* Molten Gold
* Amber
* Solar Orange
* Rose Copper
* Champagne
* Sunset Coral
* restrained Crimson Ember

Do not use every accent simultaneously.

Create disciplined design tokens.

Warm highlights should feel like:

* light
* energy
* heat
* premium materials

not flat neon colors.

---

# 46. MANDATORY GPT IMAGE 2.5 ART DIRECTION

THIS REQUIREMENT IS CRITICAL.

The flagship visual identity of Ruvora must be created with:

# GPT IMAGE 2.5

whenever GPT Image 2.5 image-generation capability is available in the current environment.

Use GPT Image 2.5 explicitly for the major artistic assets.

Do NOT replace those assets with easier generic procedural graphics.

The principal visuals must NOT primarily be:

* generic Three.js geometry
* primitive spheres
* CSS gradient blobs
* random particles
* stock images
* generic AI illustrations
* placeholder graphics
* generic SaaS mockup art

Those technologies may only support the artwork.

They must not define the artwork.

---

# 47. IMPORTANT IMAGE TOOL FALLBACK RULE

If GPT Image 2.5 is genuinely unavailable in the current coding-agent environment:

DO NOT substitute generic Three.js visuals and pretend the requirement was satisfied.

Instead:

1. build the proper asset slots and responsive image architecture
2. create exact detailed GPT Image 2.5 generation prompts
3. document them
4. create `VISUAL_ASSET_MANIFEST.md`
5. clearly report which assets remain to be generated

But if GPT Image 2.5 IS available:

GENERATE AND INTEGRATE THE REAL ASSETS.

---

# 48. VISUAL QUALITY TARGET

GPT Image 2.5 assets should look like artwork commissioned for:

* an international technology launch
* a flagship premium brand campaign
* a major creator platform
* a luxury digital product
* an elite product-film still

Aim for:

* exceptional material detail
* cinematic lighting
* sophisticated reflections
* rich depth
* beautiful warm colors
* original art direction
* high-end composition
* crisp production quality

The visual assets must remain impressive in a STATIC SCREENSHOT.

Animations should enhance exceptional artwork.

Animations must not disguise generic artwork.

---

# 49. RUVORA SIGNATURE ORB FAMILY

Create a canonical family of:

# RUVORA ENERGY ORBS

using GPT Image 2.5.

These orbs should become recognizable Ruvora visual signatures.

They may represent:

* participation
* influence
* network activity
* rewards
* momentum
* economic energy
* distribution

They should include sophisticated combinations of:

* translucent materials
* premium glass
* internal warm light
* molten cores
* metallic reflections
* complex layered structure
* controlled energy
* premium highlights

They must NOT look like:

* planets
* crypto coins
* simple CSS spheres
* primitive 3D objects
* generic gradient balls

---

# 50. REUSE THE EXACT SAME CANONICAL ORBS

This is extremely important.

Once the canonical Ruvora orb family has been generated:

REUSE THE SAME ASSETS THROUGHOUT THE PRODUCT.

Do NOT regenerate unrelated orb designs for each section.

The same visual objects should reappear coherently in:

* hero
* scroll storytelling
* creator sections
* Events
* profile experience
* dashboards
* final CTA
* social-share cards where appropriate

Consistency creates brand identity.

Do not create 20 unrelated versions of the same concept.

---

# 51. REQUIRED GPT IMAGE 2.5 ASSET FAMILY

Create a planned visual asset package.

At minimum investigate/create:

## A. Ruvora Flagship Hero Artwork

One extraordinary cinematic hero centerpiece.

Possible conceptual directions include:

* monumental energy sculpture
* interconnected warm energy forms
* futuristic social ecosystem
* molten golden/copper network energy
* abstract representation of creators, audiences and rewards

It must be Ruvora-specific.

Do NOT use a generic rotating 3D sphere.

---

## B. Signature Energy Orbs

Create several canonical reusable orb assets.

Where useful:

* isolated composition
* transparent-friendly backgrounds
* multiple orientations
* desktop/mobile-safe framing

---

## C. Creator Economy Artwork

Represent:

small audience

→ participation

→ community

→ monetization

Avoid generic influencer photography.

---

## D. Ruvora Link Artwork

Represent one premium digital identity connecting several social presences.

---

## E. Advertising Artwork

Represent brands funding legitimate participation and engagement.

Avoid generic billboard imagery.

---

## F. Event Artwork

Create more energetic premium imagery for:

* competitions
* challenges
* Event progression
* prize pools

while staying inside the Ruvora visual language.

---

## G. Revenue / Participation Artwork

Represent validated contribution and distribution.

Do NOT portray RU as cryptocurrency coins.

---

## H. Dashboard Atmosphere

Create restrained supporting imagery/textures that preserve Ruvora identity inside authenticated areas.

---

# 52. GPT IMAGE 2.5 GENERATION WORKFLOW

Do not automatically accept the first generated image.

For major assets:

1. establish artistic objective
2. generate candidates when practical
3. inspect candidates
4. choose strongest direction
5. refine when necessary
6. integrate into the real page
7. inspect crop/layout
8. optimize
9. test mobile
10. reuse canonical assets consistently

Image generation is an art-direction workflow.

Not a checkbox.

---

# 53. VISUAL ASSET MANIFEST

Create:

`docs/VISUAL_ASSET_MANIFEST.md`

For major generated assets record:

* name
* purpose
* model: GPT Image 2.5
* prompt / prompt summary
* dimensions
* master file
* production file
* responsive variants
* canonical/non-canonical status
* pages using the asset
* optimization performed

Future coding agents must consult this document before generating replacement artwork.

---

# 54. ASSET ORGANIZATION

Use clean directories such as:

`/public/assets/brand/`

`/public/assets/hero/`

`/public/assets/orbs/`

`/public/assets/creator/`

`/public/assets/events/`

`/public/assets/advertising/`

`/public/assets/backgrounds/`

Do not scatter assets around the project.

Use appropriate modern web formats:

* AVIF
* WebP

while retaining quality.

Keep transparency where useful.

Avoid visibly degraded recompression.

---

# 55. IMAGE RESOLUTION

Images must remain crisp on:

* high-density phones
* tablets
* laptops
* desktop
* large displays
* 4K monitors

Never stretch a low-resolution generated image across a huge hero.

Use proper responsive source dimensions.

Do not create a visually beautiful hero that becomes blurry when zoomed.

---

# 56. RESPONSIVE ART DIRECTION

Important artwork must be deliberately responsive.

Consider:

* desktop crop
* tablet crop
* mobile crop
* focal point
* text-safe zones
* aspect ratio
* loading priority

Create dedicated mobile variants when useful.

Do NOT simply shrink the desktop visual until it becomes unreadable.

---

# 57. THREE.JS / WEBGL / CANVAS RULE

Three.js, WebGL, Canvas and CSS visual effects are allowed only as enhancement layers.

Good uses:

* subtle parallax
* image depth
* atmospheric particles
* premium hover movement
* mouse-reactive light
* controlled displacement
* elegant background energy
* transitions

Bad uses:

* replacing GPT Image artwork with primitive spheres
* building the entire hero from generic geometry
* random particle backgrounds as the main visual
* filling blank sections with generic 3D objects

Priority hierarchy:

# GPT IMAGE 2.5 ART DIRECTION

↓

# PREMIUM UI COMPOSITION

↓

# SUBTLE REAL-TIME ENHANCEMENT

Never invert this hierarchy.

---

# 58. PUBLIC LANDING PAGE

Create a spectacular Ruvora landing page.

It must NOT look like stacked generic SaaS sections.

Use:

# SCROLL STORYTELLING

Possible structure:

1. Monumental Hero
2. Ruvora Link reveal
3. Monetize from follower #10
4. Creator Economy
5. User participation
6. Advertiser ecosystem
7. Events and challenges
8. Reward Units
9. Revenue sharing
10. Trust and validated activity
11. Premium product/dashboard showcase
12. Viral Ruvora network effect
13. Final CTA
14. Premium footer

Create a continuous visual narrative.

Do not merely alternate:

text

image

text

image

---

# 59. HERO

The hero must create an immediate WOW reaction.

Potential primary copy:

**Turn your social presence into an economy.**

Supporting concept:

**Monetize your audience. From follower #10.**

Never imply guaranteed earnings.

The GPT Image 2.5 hero artwork should feel monumental.

Typography and UI should be composed around the artwork.

Do not design a generic hero first and later insert an image into a rectangle.

---

# 60. DESIGN MUST BE STRONG WITHOUT MOTION

Ruvora must look exceptional in:

* screenshots
* social media captures
* static images
* paused animations

Motion is enhancement.

It must not be required to make a generic design feel premium.

---

# 61. MOTION DESIGN

Use expensive-looking restrained motion.

Possible techniques:

* subtle orb floating
* controlled glow breathing
* refined reveal on scroll
* smooth number transitions
* parallax
* premium hover states
* elegant section transitions
* subtle energy trails

Avoid:

* constant distracting motion
* excessive particles
* unnecessary GPU load
* nauseating movement
* gaming-style flashing effects

Respect:

`prefers-reduced-motion`

Use lighter motion on mobile where appropriate.

---

# 62. ENERGY TRAILS

Use elegant warm connection trails to represent:

* social connections
* campaign distribution
* creator influence
* revenue flow
* viral spread

They should feel controlled and premium.

Not like a sci-fi HUD.

---

# 63. GLASS AND DEPTH

Glass effects may be used carefully.

Use:

* layered depth
* subtle transparency
* elegant reflections
* premium shadowing
* warm lighting

Do not turn every card into transparent glass.

Readability comes first.

---

# 64. AUTHENTICATED PRODUCT VISUAL QUALITY

Do not make:

landing = extraordinary

dashboard = generic admin template

The authenticated experience must retain the same Ruvora DNA.

Reduce visual intensity where productivity requires it, but retain:

* canonical orbs
* warm lighting
* premium surfaces
* signature materials
* typography
* branded charts
* Event artwork
* distinctive progress components

---

# 65. ROLE-SPECIFIC DESIGN CHARACTER

PUBLIC WEBSITE

Most spectacular and cinematic.

CREATOR AREA

Prestige, influence, growth, community.

USER AREA

Participation, progression, rewards.

ADVERTISER AREA

Performance, control, analytics.

ADMIN

More restrained, information-dense, but still premium.

---

# 66. EVENTS DESIGN

Events should be some of the most shareable Ruvora pages.

Support dedicated premium GPT Image 2.5 Event artwork.

An Event page should make:

* prize pool
* time remaining
* participant count
* personal score
* ranking
* milestones
* sponsor
* rules

immediately understandable.

Event artwork should be social-share worthy.

---

# 67. SOCIAL SHARE VISUALS

Ruvora is designed to spread through social platforms.

Create premium share treatments for:

* Ruvora homepage
* creator profile
* Event
* achievement
* major milestone

A shared Ruvora URL should look attractive before being opened.

Use canonical visual assets.

---

# 68. RESPONSIVE DESIGN — NON-NEGOTIABLE

Mobile is a PRIMARY platform.

Many visitors will arrive directly from social applications.

Test at minimum:

* small mobile
* large mobile
* tablet
* laptop
* desktop
* large desktop

Requirements:

* no horizontal overflow
* no clipped artwork
* no tiny controls
* readable typography
* usable navigation
* mobile-friendly tables
* proper safe areas
* proper image cropping
* preserved visual impact

The Ruvora Link page must feel incredible on mobile.

---

# 69. ACCESSIBILITY

Premium visual design must remain accessible.

Implement:

* semantic HTML
* keyboard navigation
* focus states
* accessible forms
* labels
* dialogs
* sufficient contrast
* reduced motion
* proper landmarks

Do not sacrifice accessibility for effects.

---

# 70. PERFORMANCE

Spectacular design must remain performant.

Use:

* optimized images
* responsive images
* lazy loading
* smart preload for critical hero media
* code splitting
* reduced mobile effects
* efficient queries
* caching where appropriate

Do not ship huge visual libraries without justification.

Measure where possible.

Never invent performance scores.

---

# 71. DEVELOPMENT DATA

Create polished development seed data.

Include examples of:

* normal users
* Nano creators
* larger creators
* advertisers
* campaigns
* Events
* quests
* achievements
* RU
* XP
* Event Points
* financial transactions
* profiles

The application should look convincingly populated in development.

But seed/demo data must always be clearly development data.

---

# 72. OBSERVABILITY

Create structured server logging.

Where appropriate:

* request/correlation IDs
* economic-operation IDs
* campaign IDs
* Event IDs

Do not expose secrets.

Prepare architecture for future metrics and monitoring.

---

# 73. CI QUALITY GATES

Create GitHub CI.

At minimum:

* dependency install
* lint
* typecheck
* unit tests
* integration tests
* production build

Include database test setup where practical.

Do not create a fake green pipeline by skipping important tests.

---

# 74. AUTOMATED TESTS

Prioritize automated testing around:

* authentication
* authorization
* role combinations
* campaign budget
* advertising-event validation
* duplicate protection
* RU generation
* RU lifecycle
* advertiser RU
* XP
* Event Points
* Event rankings
* ledger integrity
* idempotency
* revenue pool
* distribution calculation
* rule versioning
* Margin Governor
* referrals
* policy gating
* i18n

---

# 75. END-TO-END TESTS

Where environment allows, test key journeys:

USER

registration

→ onboarding

→ dashboard

→ campaign participation

→ validated activity

→ RU / XP generation

CREATOR

registration

→ creator onboarding

→ public Ruvora Link

→ creator dashboard

ADVERTISER

registration

→ advertiser onboarding

→ campaign creation

→ campaign activation/test flow

→ validated activity

→ advertiser RU

EVENT

join

→ validated activity

→ Event Points

→ leaderboard

ADMIN

review campaign

→ inspect activity

→ inspect RU

→ preview distribution

Never claim browser tests were executed if they were not.

---

# 76. NO EMPTY SHELLS

If a visible feature appears functional:

make it functional.

If not implemented:

* hide it
* disable it clearly
* or label it clearly

Do not build:

* dead buttons
* fake analytics
* fake money
* fake advertiser performance
* fake campaigns
* fake APIs

Seed data is acceptable only when clearly labelled development/demo data.

---

# 77. PROJECT DOCUMENTATION

Create and maintain:

`AGENTS.md`

`PROJECT_MEMORY.md`

`ARCHITECTURE.md`

`PRODUCT.md`

`DESIGN_SYSTEM.md`

`ECONOMY.md`

`RU_ENGINE.md`

`EVENT_ENGINE.md`

`ADVERTISING_ENGINE.md`

`LEDGER.md`

`MARGIN_GOVERNOR.md`

`FRAUD_AND_RISK.md`

`SECURITY.md`

`I18N.md`

`VISUAL_ASSET_MANIFEST.md`

`DEPLOYMENT_ABACUS.md`

`TESTING.md`

`ROADMAP.md`

`CHANGELOG.md`

`RELEASE_REPORT.md`

---

# 78. AGENTS.MD PERMANENT RULES

AGENTS.md must tell every future coding agent:

GitHub is canonical.

Read PROJECT_MEMORY before major work.

Read ECONOMY and RU_ENGINE before changing Reward Units.

Read LEDGER before modifying financial code.

Read VISUAL_ASSET_MANIFEST before generating/replacing visual assets.

Never silently rewrite finalized economic history.

Never directly mutate monetary balances.

Never bypass server-side authorization.

Never hard-code user-facing strings.

Never weaken financial integrity.

Never replace canonical Ruvora visuals with generic assets.

Run tests before claiming success.

Update project documentation after architectural changes.

---

# 79. PROJECT_MEMORY.MD

Keep this document concise.

Record:

* Ruvora purpose
* permanent architectural rules
* permanent economic rules
* official design direction
* canonical visual asset rules
* current stack
* completed implementation
* current limitations
* last validation state
* recommended next work

Future coding agents must be able to regain context quickly.

---

# 80. FIRST DEVELOPMENT PASS — P0 PRIORITY

This product is large.

Do not create 100 shallow screens.

Build a coherent vertical slice.

P0:

* repository architecture
* database
* authentication
* multi-role authorization
* EN/FR
* Ruvora Design System
* GPT Image 2.5 visual identity
* canonical Ruvora orb family
* spectacular homepage
* onboarding
* Ruvora public profiles
* user dashboard
* creator dashboard
* advertiser dashboard
* campaign creation
* advertising activity
* validation pipeline
* XP
* Reward Units
* advertiser RU
* Event Points
* initial Event Engine
* ledger
* Global Distribution Pool architecture
* Margin Governor architecture
* admin
* trust/risk foundation
* CI
* tests
* project documentation
* Docker
* Abacus deployment readiness

---

# 81. P1 — COMPLETE WHERE FEASIBLE AFTER P0

After P0 is stable, improve:

* quests
* achievements
* referrals
* creator analytics
* advertiser analytics
* sponsored Events
* prize pools
* profitability cockpit
* richer anti-fraud rules
* creator theme customization
* share cards
* richer Event design
* visual polish
* deeper E2E coverage
* improved accessibility
* improved performance

Do not compromise P0 integrity merely to claim more features.

---

# 82. DESIGN ACCEPTANCE GATE

Before completion, inspect:

HOMEPAGE DESKTOP

HOMEPAGE MOBILE

RUVORA LINK DESKTOP

RUVORA LINK MOBILE

USER DASHBOARD

CREATOR DASHBOARD

ADVERTISER DASHBOARD

EVENT PAGE

ADMIN

Specifically check:

* image sharpness
* canonical orb consistency
* warm color consistency
* typography
* spacing
* responsiveness
* crop quality
* no overflow
* mobile navigation
* animation quality
* readability
* dashboard polish
* no generic template feeling

Fix problems you discover.

---

# 83. VISUAL ACCEPTANCE QUESTIONS

Before declaring visual work complete, explicitly answer:

### Hero

Does the hero look like commissioned flagship campaign artwork?

### Static quality

Would a screenshot still look exceptional?

### Orbs

Are the orbs bespoke GPT Image 2.5 assets rather than procedural primitives?

### Coherence

Are canonical visual assets reused consistently?

### Creator desirability

Would a creator genuinely want to place this Ruvora Link in their bio?

### Events

Would users want to share an Event page?

### Mobile

Does the premium impact survive on mobile?

If a major answer is NO:

improve it.

---

# 84. FINAL TECHNICAL VALIDATION

Before finishing:

run lint

run typecheck

run tests

run production build

run database migrations from clean state where possible

test seed process

test authentication

test authorization

test user journey

test creator journey

test advertiser campaign flow

test validated advertising activity

test advertiser RU

test Event Points

test Event ranking

test ledger invariants

test distribution preview

test Margin Governor behavior

test EN/FR

inspect browser console

inspect server logs

inspect mobile layouts

inspect desktop layouts

Fix discovered issues before claiming completion.

---

# 85. FINAL RELEASE REPORT

Create:

`RELEASE_REPORT.md`

Report exactly:

1. What was implemented
2. Architecture
3. Stack
4. Database
5. Authentication
6. User experience
7. Creator experience
8. Advertiser experience
9. Ruvora Link
10. Advertising Engine
11. Validated Activity
12. Reward Unit Engine
13. Advertiser RU
14. Event Engine
15. Event Points
16. Ledger
17. Global Distribution Pool
18. Margin Governor
19. Trust and Safety
20. Admin
21. Internationalization
22. Visual system
23. GPT Image 2.5 assets generated
24. Canonical Ruvora assets
25. Responsive validation
26. Accessibility work
27. Performance work
28. Tests executed
29. Exact test results
30. Known limitations
31. Remaining technical debt
32. P1 completed
33. Recommended next pass
34. Local startup instructions
35. Environment configuration
36. Docker instructions
37. Git branch
38. commits
39. PR information if applicable
40. Abacus deployment readiness

Be completely honest.

Do not claim anything was executed or validated if it was not.

---

# 86. AUTONOMY

Work autonomously.

Do not repeatedly ask for:

* minor naming decisions
* minor UI decisions
* implementation details
* obvious engineering choices

Use the requirements and strong professional judgment.

When an irreversible business rule remains undefined:

make it configurable rather than inventing a permanent rule.

---

# 87. PRODUCT PRINCIPLE

Ruvora must NEVER feel like:

> "a website where people click ads for pennies."

Ruvora must feel like:

> **a premium independent monetization layer for the entire social web.**

Creators bring audiences.

Users participate.

Advertisers fund legitimate engagement.

Events create excitement and viral loops.

XP drives progression.

Event Points drive competition.

Reward Units represent validated economic participation.

The Global Distribution Pool aligns the ecosystem.

Ruvora Links spread naturally across social networks.

The Margin Governor protects sustainability.

The financial ledger protects integrity.

---

# 88. VISUAL PRINCIPLE

Ruvora must not look incredible merely because it contains animations.

It must look incredible because of:

* exceptional GPT Image 2.5 artwork
* typography
* composition
* lighting
* materials
* canonical visual assets
* responsive art direction
* polished interface design
* coherent branding

Motion then makes that exceptional design feel alive.

---

# 89. FINAL NON-NEGOTIABLE RULE

The visual hierarchy is:

# GPT IMAGE 2.5 CREATES THE WORLD

↓

# THE INTERFACE COMPOSES THE WORLD

↓

# CODE ANIMATES THE WORLD

Never:

# GENERIC THREE.JS DEMO

↓

# UI ADDED AROUND IT

This distinction is fundamental to the Ruvora brand.

---

# 90. EXECUTION

Begin by auditing the repository if one already exists.

If this is a greenfield repository:

create the clean production-oriented foundation.

Implement the strongest coherent P0 vertical slice possible.

Do not build a disposable mockup.

Do not sacrifice architecture for feature count.

Do not sacrifice visual excellence for development convenience.

Do not sacrifice accounting integrity for speed.

Do not sacrifice mobile usability for desktop visuals.

Do not sacrifice maintainability for unnecessary complexity.

At completion, leave Ruvora in a state that another senior engineer or coding agent can immediately continue from GitHub without needing undocumented context.

Build the foundation of the real Ruvora.
