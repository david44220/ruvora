# Margin Governor

`evaluateMarginGovernor` is a deterministic affordability gate, using bigint EUR cents and a versioned configuration. It accepts recognized eligible advertising revenue, a requested Global Distribution Pool and explicit liability estimates.

Supported liability inputs: provider fees, taxes, refunds, chargebacks, fraud losses, outstanding campaign liabilities, user rewards, creator rewards, advertiser rewards, referral allocations, event liabilities, sponsored prize pools, infrastructure and other operating costs. Unknown liability names and negative amounts are rejected, reducing the chance that a misspelled expense is silently ignored.

Each economic obligation belongs in exactly one liability input. Do not double-count settled costs in both eligible revenue and the liability list. Unspent deposits are liabilities, not earned advertising revenue. A campaign-funded prize pool is separately reserved and cannot also fund the Global Distribution Pool. The service preparing inputs must document its revenue-recognition/cost basis.

The retained safety floor is the greater of the configured minimum operating profit and configured gross-revenue margin percentage. Percentage floors round up to a whole cent. The operating reserve is then also protected.

    net capacity = eligible revenue - liabilities - operating reserve - retained floor
    affordable pool = max(0, net capacity)

In REDUCE mode, an oversized requested pool is lowered to affordable capacity. In BLOCK mode it becomes zero. APPROVED, REDUCED or BLOCKED and machine-readable reasons are returned alongside all computed amounts. Existing liabilities can exceed revenue; that condition is visible and never produces a negative pool.

Estimated operating profit equals eligible revenue less liabilities and the allowed pool. The operating reserve is retained cash, not an additional operating expense, and remains within that displayed retained amount. The configurable target is informational; the separately configured minimum profit is an enforced floor. Targets are not marketing promises.

The gate constrains economic affordability; it does not prove that cash is available in the funding ledger bucket. `finalizeDistribution` separately verifies available funding. Server orchestration must compute fresh liabilities and eligible revenue, serialize concurrent operations, persist the full decision/rule snapshot and recheck before finalization. A stale preview cannot authorize a later unaffordable settlement.

This implementation is a foundation for operator-reviewed economics, not automated tax advice, solvency certification or a complete financial forecast. Real costs, provider reconciliation and reserve policy are operational requirements before accepting live funds.
