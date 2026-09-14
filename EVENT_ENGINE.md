# Event Engine

Event Points belong to one event and remain separate from EUR, Reward Units and XP. Entry is free. A funded prize is an explicit sponsor obligation, never a deposit reward, wager, or fixed RU exchange.

## Configuration and lifecycle

`src/server/events.ts` implements creation, submission, independent review, activation, pause, completion, cancellation, membership and disqualification. New events retain owner/sponsor/host identities, localized EN/FR title/description/rules, geography and participant caps, versioned per-activity point rates, a UTC daily point cap, milestone labels, reward tiers, visibility and an exact EUR prize budget. Milestones describe progress thresholds; they do not silently issue XP, money or additional points. Nonzero `ruBonusBudgetMicros` is unsupported and rejected. `RETURN_SPONSOR` is the only unused-funds policy.

The lifecycle is `DRAFT → PENDING_REVIEW → APPROVED → ACTIVE ↔ PAUSED → COMPLETED → SETTLING → SETTLED`. Review can reject a submission. Cancellation has explicit restrictions. Activation can occur before the start date; joining and activity remain closed until that date. Existing free-event `UPCOMING` and `legacy-event-v1` records remain compatible. The public query also recognizes `SCHEDULED` for future lifecycle compatibility; this pass does not create that state.

Configuration freezes on submission. Approval captures the exact dates, identities, prize rules, localized content and version. Activation verifies the snapshot, the complete reserved prize budget and independently reviewed linked campaign media owned by the sponsor. Campaign review can happen while the parent event is under review, avoiding circular activation requirements. Creator-only hosts require creator policy eligibility and cannot create an unfunded monetary sponsor promise.

## Validated activity and ranking

Submission/review locks the event in the same serializable transaction as activity and point writes. Participation requires onboarding, the platform and event country policies, membership before the source activity, capacity, a valid event window, no disqualification and no owner/sponsor/host self-farming. Event review must be independent of those beneficiaries. Reversal before freezing remains possible when the participant has since become held or disqualified.

`eventPointsAward` uses the event's frozen point configuration. The UTC cap uses source activity timestamps, so delayed validation cannot move an award into another day. A capped award can be zero while separately valid RU and XP remain distinct. Point records carry the event rule version and source activity.

Scores sort by descending points, earliest attainment of the remaining score, then locale-independent user ID. Exact negative correction entries remove the reversed contribution before calculating attainment. Duplicate or cross-event sources, orphan/partial reversals and unsafe integer scores fail closed. Final ranking includes only eligible participants with positive valid points and is read from the immutable final snapshot after settlement.

## Funded settlement and cancellation

See [EVENT_SETTLEMENT.md](EVENT_SETTLEMENT.md) for snapshot, approval, deterministic cents, payout and refund contracts. Pending activity blocks freezing. Once `SETTLING`, new activity, point awards and reversals are blocked at service and database boundaries. Disqualification before finalization invalidates the preview and requires another snapshot; final membership and rankings cannot be rewritten.

A sponsor may cancel before participation starts. After activation an independent administrator may cancel only when no pending or validated participation remains. Every remaining reserved cent returns to the original sponsor. A frozen or settled event cannot be cancelled. Late corrections require a separately reviewed compensating financial operation; this pass does not provide an automatic post-settlement recovery engine.

## Verification

The event unit suite covers exact rounding, vacant ranks, exclusions, stable ties, complete reversals, version mismatch, underfunding, immutable snapshots and net liability. Ten PostgreSQL event integration tests passed on the isolated `ruvora_test` database on 2026-09-14, including real competing funding, capacity, duplicate finalization, reversal/freezing and cancellation/settlement races. Provider and browser verification are documented separately by their owners; these tests do not establish live payment support.

The sponsored-event Chromium journey also passed on 2026-09-14 (2.0 minutes): application event creation/funding/review/activation/join/point validation, real-clock closing with no date rewrite, two distinct administrator MFA sessions, rejection before fresh MFA, rejection of self-approval, separate approval and finalization, exact replay, a 601-cent participant payable and 400-cent sponsor refund. The final public event passed a 390px page-overflow assertion and the participant wallet contained exactly one event prize credit. The retained mobile screenshots were inspected. These are local development browser results, not evidence of external payment delivery.
