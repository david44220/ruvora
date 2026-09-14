# Direct referral engine

Ruvora implements one direct referral relationship per new account. It is an acquisition relationship with bounded contribution rewards, not a recruitment investment product. Registration, sharing and deposits award zero RU and zero money. There is no paid entry, downline compensation, referral-on-referral award, income guarantee, or fixed RU-to-currency rate.

## Trusted attachment

An eligible account generates an opaque referral entry using the same server-owned token/binding pipeline described in ATTRIBUTION_ENGINE.md. The authenticated account must have been created after the captured touch and before context expiry. Only the registration binding path creates Referral; an existing account logging in through a referral link is never recruited retroactively.

The persisted relationship records one inviter, invitee, originating attribution context, policy snapshot and qualification expiry. Unique invitee/context constraints and database provenance guards prevent changing the parent. The service follows existing ancestry and rejects self-referrals, cycles, repeated ancestors and unbounded ancestry. A legacy Pass 01 relationship without trusted context and policy cannot mint new referral RU.

A pending anonymous referral context may be replaced before registration by another explicit entry, particularly the first eligible creator context. The explicit referral CTA from an already captured creator profile is supported before signup: an appended context retains that first creator and clock while capturing the trusted referral entry. It does not overwrite the parent origin or count an extra observed session. After registration, the direct relationship cannot be overwritten by subsequent links. There is no silent last-click rewrite of an established relationship.

## Eligible awards and caps

The transactional activity review service calls awardReferralForActivity only after independently validating and billing a positive eligible activity and calculating its base USER RU. The referral calculator receives only that direct USER contribution; referral awards are never the source for another referral award. A separate REFERRAL-category RewardUnit and immutable ReferralCredit retain the activity ID, rule version, amount and UTC monthly cap period. One activity can have at most one referral credit.

The captured development rule enables a reward of 1,000 basis points (10%) of eligible USER RU, capped at 100,000 micros per activity, 5,000,000 micros per referrer per UTC calendar month, and 25 qualifying direct referees per month. Qualification expires 30 days after account creation. These are explicit development defaults, not permanent commercial promises. Old rule JSON that omits referral policy defaults to disabled. A newly published version activates changes; historical rules are never edited.

The original snapshot controls the relationship's economic coefficients, expiry and caps. The current global enabled flag is also a kill switch. Fresh referrer participation policy, country, economic hold, suspension and origin revocation are checked at award time. Advertisers cannot receive referral rewards from their own campaigns. Beneficiary administrators cannot review or reverse activities that credit their referral account.

The recipient User row is locked within the serializable billing transaction before monthly totals are read. Caps count all immutable credits minted in that month, including later reversals. Reversing a fraudulent action never reopens quota for repeated farming. There is no externally verified identity provider in this build: the pure calculator supports a shared-identity rejection signal, but server code does not pretend it possesses independent cross-account identity evidence. Rate limits, provenance binding, cap limits, holds and independent review provide the implemented safeguards.

## Reversal and money

Before final distribution, invalidating an activity reverses all its eligible RU categories, including REFERRAL, and appends compensating money, XP and Event Point entries. ReferralCredit remains immutable for evidence and cap accounting. Consumed RU and finalized event/distribution history cannot be rewritten; recovery needs separately reviewed compensating operations and holds.

REFERRAL RU participate only in the configurable referral category of a reviewed global distribution. They have no fixed monetary value. A zero-cent allocation, blocked policy, insufficient eligible revenue or Margin Governor restriction may result in no money. The ordinary double-entry ledger and finalization rules remain mandatory.

## Evidence and limitations

The pure referral engine and ancestry helpers have unit coverage. Attribution integration tests exercise zero signup rewards, one qualifying credit, exact amount, concurrent recipient caps, no capacity reset after reversal, administrator conflict, referrer holds, immutability and actual analytics. No live identity, payout, email or ad provider certification is claimed. See SECURITY.md, FRAUD_AND_RISK.md, LEDGER.md and RELEASE_REPORT.md for deployment and verification limits.
