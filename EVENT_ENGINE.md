# Event Engine

Event Points are scoped to one event. They are neither money, RU nor XP. A campaign may be linked to an event, but each point award still references the eligible validated activity and participant. Monetary sponsored prizes are a separate liability with their own ledger pool; paid entry and wagering are not part of the initial product.

`calculateActivityRewards` can independently emit Event Points when an eligible event association is supplied. The server must establish that the event is active, the participant joined, the campaign/activity is eligible and policy gates pass. Supplying an event ID from the browser is not event eligibility.

## Ranking

`rankEventParticipants` orders by descending safe-integer score, then earliest attainment timestamp, then stable user ID. Every participant receives a unique ordinal rank. IDs compare with a locale-independent ordering so operating-system locale does not change winners. Ties and rewards must use this published policy, never random selection or database default ordering.

`computeEventScores` takes append-only point entries for exactly one event, rejects cross-event inputs, duplicate IDs and repeated activity/user awards, validates full compensating reversals, and recomputes the current leaderboard. A participant's attainment timestamp is the latest remaining valid contribution used in their current score. Reversing a contribution removes its effect before ranking and does not delete the historical entry.

`reverseEventPoints` returns an exact negative correction referencing the source. Reversal must not precede the original, repeat an existing reversal, target a correction, or change the participant/activity. The database must additionally enforce uniqueness and authorization when committing entries. Scores are safe integers; overflow is rejected.

## Settlement and follow-on work

The current domain provides deterministic scores and reversals. Final event closure, winner snapshot approval, sponsored-prize distribution, configurable ranking reward tiers, explicit RU bonuses and milestones need the same versioned/frozen/transactional discipline as revenue distributions. Do not claim that a leaderboard alone settles prizes.

Before any sponsored event prize launch, reserve its separate ledger funds, define eligibility/anti-abuse review, publish versioned ranking and reward rules, freeze final eligible standings and settle through balanced journals. Late invalidation must trigger reviewed compensation without silently changing published financial history. A free public challenge must not be turned into paid entry as an implementation shortcut.
