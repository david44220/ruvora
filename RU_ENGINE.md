# Reward Unit engine

RU represent eligible validated contribution in a revenue-sharing period. Values use bigint micro-units, with 1 RU = 1,000,000 micros. They have no guaranteed monetary value.

`calculateActivityRewards` accepts a persisted activity ID, participant/advertiser IDs, type, validation state, billable EUR amount and optional eligible creator/event association. It produces separately typed USER, CREATOR and ADVERTISER unit awards plus independent XP and Event Point outputs. Every unit retains the originating activity and reward-rule version.

Only VALIDATED activity with a positive billable amount qualifies. RECEIVED, PENDING_VALIDATION, REJECTED, REVERSED, zero-billable and unsupported activity produce no final awards. Deposit/funding is deliberately absent as a rewarded activity type. Advertiser RU are calculated from genuine validated billable activity using a configurable micro-unit rate, never from a deposit. Self-participation by the advertiser produces no awards. A creator cannot award themselves creator RU from their own action or their own advertised campaign.

The caller must establish validation and eligibility using server-owned signals. Passing the word VALIDATED to a pure calculator is not proof: only the trusted transactional service can call it with authoritative records. Persistence must enforce unique activity/category/recipient awards, so retrying the underlying activity cannot duplicate RU, XP or points.

## Lifecycle

- PENDING may become VALIDATED, REJECTED or REVERSED.
- VALIDATED may become CONSUMED or REVERSED.
- REJECTED and REVERSED are terminal.
- CONSUMED belongs to a finalized immutable distribution and is terminal.

`transitionRewardUnit` returns an audit transition, without mutating the supplied record. CONSUMED requires a distribution reference. Economic events are retained rather than deleted.

A pre-settlement invalidation produces a recorded reversal. `reverseRewardUnit` handles consumed RU by returning POST_FINALIZATION_REVIEW and an economic-hold requirement. It does not recalculate a finalized period, silently remove a payout, or authorize recovery. Settlement corrections need a reviewed compensating ledger operation, with provenance to the original activity/distribution.

## Referral and event bonuses

Referral RU have their own category. `calculateReferralReward` allows one direct attribution based on a legitimate validated source award, caps reward per activity and per referrer-period, and caps qualifying referee count. It rejects self/shared-verified-identity referrals, duplicate awards, ineligible sources and referral-on-referral compensation. Server storage must enforce attribution uniqueness and lock cap counters during award creation.

Arbitrary profile actions and deposits cannot mint economic RU. Future event bonuses require explicit versioned eligibility, an approved economic source and audit records; generic XP/Event Point progress is not sufficient by itself.
