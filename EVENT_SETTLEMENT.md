# Event Settlement

An event prize pool is funded from existing advertiser available funds. Settlement allocates that reserved EUR pool to existing participant payable accounts and returns every unused cent to the original sponsor. It does not issue Reward Units, consume GDP Reward Units or alter XP.

## Service contracts

- `fundEventPrize(actor,eventId,{amountMinor,idempotencyKey})` reserves sponsor funds, capped by the disclosed prize budget. It cannot fabricate a payment receipt.
- `createEventSettlementPreview(admin,eventId)` requires a completed event after its approved end date, independent administration, full funding and no pending review. It freezes event activity and returns `{settlement,preview}`.
- `finalizeEventSettlement(admin,eventId,{previewId,idempotencyKey,approvalId})` requires the same freshly recalculated snapshot and a separately approved financial action.

The financial approval uses operation `EVENT_SETTLEMENT`, target `eventId`, payload `{previewId,fingerprint}` and the event rule version. The requester executes; a distinct eligible administrator approves. Both must remain independent of the owner/sponsor/host and positive prize allocations. The API applies fresh MFA/reauthentication, and the service consumes the approval atomically with settlement. An exact finalized retry returns before re-consuming approval. Changed actor, event, preview, approval or idempotency payload fails.

## Deterministic allocation

The snapshot retains configuration, platform eligibility policy version, participants and exclusion reasons, all point origin/reversal IDs and values, ranked eligible scores, exact award amounts, refund amount and stable tie-break policy. EUR uses bigint minor units and persists as lossless decimal strings in JSON. A canonical payload is SHA-256 fingerprinted. The final snapshot embeds the unchanged preview plus approval, journal, finalizer and timestamp.

Reward tiers define disjoint inclusive rank ranges with a basis-point share of the total prize budget. Shares may total less than 10,000; the remainder is explicitly unused. Largest remainder first apportions exact cents to tiers and the unused share, then equally among all configured slots within each tier. Stable numeric rank keys break allocation remainders. Missing winners leave their slots unused; their money returns to the sponsor. No eligible positive-point participants means a complete refund. Example: a 1,001-cent pool split 60% to rank 1 and 40% to ranks 2–3 yields 601/200/200 cents. With only two winners, 200 cents returns to the sponsor.

## Transaction and database boundaries

The serializable transaction locks the Event row. Activity changes, point insertion and membership changes take the same lock through services and database triggers. Freezing refuses pending activity. New points, validation, rejection and reversal cannot cross the frozen boundary. A changed hold, disqualification, platform eligibility rule or funding position makes the preview stale; another preview is required.

Finalization atomically consumes approval, posts one balanced journal, saves the final snapshot, marks the event settled and writes audit evidence. Deferred constraints verify the event pool is emptied, every winner credit equals its snapshot allocation, refunds go only to the sponsor and no prize transfer reaches general revenue. There is one final settlement per event. Final snapshots, point entries, ledger history and final memberships cannot be changed or deleted.

The transaction retry helper recognizes both Prisma `P2034` and raw-query `P2010` with SQLSTATE `40001`/`40P01`, retrying only serialization/deadlock conflicts within its bounded retry count. This was verified with real duplicate funding and finalization races, which exposed and then confirmed the fix for the raw-query adapter path.

## Accounting basis and limits

`event:{id}:prize` is an earmarked operational subledger liability backed by assets reserved from `advertiser:{sponsorId}`. Winners receive credits in the existing `user:{userId}` USER_PAYABLE accounts. A payable credit is not evidence of an external payout. Funds remaining after settlement or permitted cancellation return to the sponsor available account.

The GDP margin snapshot records gross prize obligations, their matching earmarked assets and any per-event shortfall. Recognized platform revenue already excludes those reserved assets; subtracting fully funded prizes again would double-count them. Only an unfunded shortfall adds to the revenue-basis liability input. Configured manual costs must cover additional obligations and avoid duplicating these recorded prize reserves. Event prize escrow cannot be used to fund GDP.

This pass deliberately rejects nonzero RU bonuses. Post-settlement invalidation does not rewrite winners or the original journal; reviewed compensating recovery and external provider reconciliation remain separate operational work. Development events/funding are visibly labelled and blocked from staging/production economic operations by explicit environment policy.

## Verification evidence

On 2026-09-14, 39 dedicated unit cases and 10 isolated PostgreSQL integration tests passed. The integration tests exercise real competing creation/funding, capacity, duplicate finalization, disqualification/hold invalidation, point freeze, reversal and cancellation races, plus attempts to redirect prize escrow into general revenue. The Chromium sponsored-event journey passed with two actual administrator MFA sessions and a separately approved immutable settlement; a single winner received a 601-cent payable, vacant ranks returned 400 cents, and replay produced no second credit.

The independent `scripts/verify-migrations.mjs` audit applied all seven migrations to a new empty local database and upgraded a second database from the three Pass 01 migrations. Fifty-three representative rows across 16 original tables, including a genuine domain-generated finalized distribution snapshot, retained identical exact old-column row digests and balances. The SQL fixture is synthetic and explicitly labelled; this does not claim an actual production backup restore. The script only creates uniquely named, retained loopback audit databases and never resets or drops pre-existing data.
