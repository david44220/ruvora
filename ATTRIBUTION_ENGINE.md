# Trusted attribution engine

Pass 02 makes creator attribution a server-owned acquisition record. A creator handle in a campaign activity request is never financial proof. The strict activity API rejects creatorHandle, creatorId, referrerId, validation status, amounts, and other undeclared fields.

## Origin and account binding

Public creator profiles, creator opportunity links, event pages, campaign shares, and direct referral links resolve eligible persisted accounts into an opaque ShareLink slug. Only server helpers create the creator/referrer/campaign/event associations. Public slugs are navigation identifiers, not authentication secrets.

Opening an entry issues a random 256-bit attribution bearer token and a separate random anonymous visitor token. Both are delivered in HttpOnly, SameSite=Lax cookies; production cookies are Secure and use the __Host- prefix. Only SHA-256 hashes are stored. There is no browser fingerprint, social-network access token, raw IP attribution graph, or claim of cross-device tracking.

A context is anonymously usable for navigation until successful authentication binds it once to a persisted account. A context already bound to another account, self-attribution, missing token half, or mismatched visitor token fails closed. Failed attribution binding must never turn a successful login into an authentication failure: the router clears invalid attribution cookies and retains the successful account session. Direct registrations still receive a deduplicated registration telemetry event.

## Captured model

The configurable model is FIRST_ELIGIBLE_CREATOR. Its development defaults are:

| Parameter                                               | Default | Bounds                                      |
| ------------------------------------------------------- | ------- | ------------------------------------------- |
| Attribution window                                      | 7 days  | 60 seconds to 7 days                        |
| Submitted activities per context                        | 100     | 1 to 1,000                                  |
| Aggregate reporting window / telemetry retention policy | 90 days | 7 to 365 days for captured retention policy |

The first eligible creator context remains fixed across later creator touches, including its original expiry and campaign/event restrictions. Its clock is never refreshed. An anonymous visitor may explicitly open a REFERRAL entry belonging to that same captured creator: the service appends a new immutable context with the original creator, timestamps and policies plus the trusted referral-entry provenance, then revokes the unused anonymous parent. Bound contexts and competing referrers cannot use this upgrade. Reporting retains one observed session and deduplicated campaign starts. Before a creator context exists, a later explicit entry may replace a noncreator anonymous context; an unbound referral click is not yet an established referral. Account creation is the point at which a direct referral becomes immutable. Cross-device or cleared-cookie recovery is intentionally absent.

Context snapshots contain the economic rule version and complete attribution/referral policies. Activities copy the context origin, identities, policy snapshot, timestamps, and destination. Database triggers reject edits/deletion of captured origins, re-binding, activity snapshot edits, and reactivation of terminal contexts. Review compares the complete stored activity snapshot with the server-owned context.

Windows are half-open: firstTouchAt <= activity.createdAt < expiresAt. A legitimately captured activity may be independently reviewed after cookie expiry. Current context revocation and current participant, advertiser and creator eligibility still apply at review. Current campaign geography, creator category, follower threshold, suspension, economic holds, self-advertising and event constraints are rechecked before credit. Campaign links require an active current campaign and actual funded escrow sufficient for one action both when issued and opened.

All submitted context activities count toward its cap, including later rejected or reversed records. Serializable transactions and persisted request fingerprints prevent concurrent cap bypass or a reused idempotency key changing evidence or attribution. A complete identical replay returns the original activity.

## Economic boundary and observability

Visits, shares, registrations, event joins, campaign entries and pending submissions create no RU, money, XP or Event Points. Only independent validation of an eligible billable activity atomically debits campaign escrow, credits recognized revenue, and creates distinct USER/CREATOR/ADVERTISER RU, any eligible direct REFERRAL RU, XP and scoped Event Points. No client-provided creator identifier reaches the calculator as authoritative attribution.

GrowthEvent records real server-observed events with unique deduplication keys: one profile/entry visit per context and entry, one attributed session per context, one registration per account, one campaign start per context and campaign (shared with pending submission), and one join per event and account. These are observable application interactions, not independently verified humans, external ad impressions, external bio-link placements or guaranteed incremental acquisition. Publishing-creator counts mean creators whose generated links have observed contexts.

Creator analytics reports the last 90 days of observed visits, contexts, registrations, campaign starts, review results, event joins, direct referrals, actual persisted CREATOR RU states and finalized CREATOR-category money allocations. Pending RU means persisted PENDING units; pending activities are separate, and no estimated payout is presented as actual money. Activity cohorts include creations or validations in the reporting window. Advertiser spend is derived from billed validated/reversed activity; growth aggregates are batched instead of queried once per creator. All demo-derived reports carry isDemo.

The retentionDays policy is captured for operational planning; automated telemetry deletion/anonymization is not implemented in this pass. Financial provenance and audit records cannot be deleted through a reporting cleanup. Production launch requires an approved retention procedure separating aggregate telemetry from financial evidence.

## Verification

`tests/unit/attribution.test.ts` covers 24 pure boundary checks. `tests/integration/attribution.test.ts` covers 21 real PostgreSQL scenarios, including forged credentials, cross-account reuse, first-touch persistence, expiry, concurrent validation, frozen cap concurrency, targeting, referral caps/reversals, explicit profile-to-referral signup, revoked referral origins, immutable provenance, analytics, public/member event projection privacy and staging demo isolation. These passed during Pass 02. Broader release checks are reported by RELEASE_REPORT.md.

The Chromium creator-acquisition journey in `tests/e2e/attribution.spec.ts` passed: public profile issues inaccessible-to-JavaScript attribution cookies, a funded featured opportunity survives signup/onboarding navigation, the activity request carries no creator identifier, pending activity creates no RU, independent administrator UI review produces actual creator RU, analytics updates, money remains unchanged before distribution, and the settled 390px layout fits the viewport. This is local development browser evidence, not live provider or production certification.

The separate share-entry concurrency suite adds four PostgreSQL scenarios for simultaneous first publication, repeated public-profile requests, revocation and holds. Canonical lookup reads existing entries before attempting a unique-key insert; it never revives a revoked entry. Tests assert stable IDs/slugs, no duplicate attribution contexts or RU, and unchanged warm-row xmin. Common transaction retry detection covers real Prisma CommonJS/ESM identities.
