# Ruvora economy

The economic core is a deterministic TypeScript domain in `src/domains/economy`. Server orchestration owns persistence, authorization, transactions and provenance. The UI never determines a billable outcome or a balance.

## Four permanently distinct systems

| System       | Representation                    | Meaning                                               |
| ------------ | --------------------------------- | ----------------------------------------------------- |
| Money        | bigint EUR minor units            | Actual accounting; 100 minor units equal EUR 1.00     |
| Reward Units | bigint micros                     | Validated contribution; 1,000,000 micros equal one RU |
| XP           | nonnegative safe integer          | Long-term progression                                 |
| Event Points | event-scoped safe integer entries | Ranking and milestones within one event               |

RU are not money, cryptocurrency, a deposit receipt, or a promise of income. There is no fixed RU exchange rate. XP and Event Points never become money by conversion. A validated action can independently produce all three nonmonetary records under versioned rules.

## Global Distribution Pool

`previewDistribution` accepts eligible recognized revenue, an immutable rule version, period bounds, exact category weights, participant eligibility and RU provenance. Category weights must total exactly 10,000 basis points. Pool percentage and category percentages are configurable. The Margin Governor first limits affordability.

Pool cents are allocated to categories with the largest remainder method. Within each category, cents are allocated by validated RU using the same method. Fractional remainders tie by stable identifier ordering. An empty category's allocation remains undistributed; it is not silently reassigned to another participant class. Multi-role accounts keep separate category RU and receive aggregated monetary ledger postings.

Snapshots include the full rules, margin inputs/decision, eligibility reasons, included RU IDs, exact amounts and period. Participant and RU order is canonicalized. The returned structures are deeply frozen, and the lossless canonical payload is persisted for integrity/idempotency comparison. Configuration changes do not rewrite snapshots.

Finalization rejects an open period, a finalized period, altered preview contents and insufficient actual funding. It returns balanced postings plus the exact RU IDs to consume. Database orchestration must lock the period, included RU and funding; recheck live holds and eligibility; and insert the final snapshot, ledger journal and consumed RU states in one serializable transaction. A pure function cannot enforce concurrent database isolation.

Eligible zero-cent allocations are final category-period outcomes and their RU may be consumed. Held/ineligible RU are recorded in the preview but are not consumed. Their resolution requires an explicit subsequent period policy; automatic carry-over is not implied.

## Configurable safeguards and limits

No monthly profit amount or legal policy is embedded as a permanent business rule. `DEVELOPMENT_REWARD_RULE` contains clearly named seed defaults only. Published creator access thresholds describe feature eligibility, never guaranteed income. The P0 core supports EUR only; future currencies require explicitly separate balanced journals and a reviewed FX domain.

Read `RU_ENGINE.md`, `LEDGER.md`, `MARGIN_GOVERNOR.md`, `EVENT_ENGINE.md`, `ADVERTISING_ENGINE.md` and `FRAUD_AND_RISK.md` before changing economic behavior. Unit evidence lives in `tests/unit/economy.test.ts`.
