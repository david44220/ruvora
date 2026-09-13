# Roadmap

This is a prioritized continuation plan, not a list of completed features. Consult [RELEASE_REPORT.md](RELEASE_REPORT.md) for implementation and validation evidence.

## P0 completion and launch gates

1. Preserve the verified identity/profile/campaign/validated-activity/event/economy slice as production providers and operational controls are added.
2. Extend existing PostgreSQL invariant/concurrency coverage into provider reconciliation, distributed requests, sustained load and explicit accounting recovery after finalization.
3. Deliver email verification and password recovery through a transactional outbox and provider-neutral mail adapter.
4. Verify the audited first-admin bootstrap on the target infrastructure, then add stronger admin authentication, operator recovery and session revocation controls.
5. Implement provider-backed payments/payouts only after webhook signatures, idempotency, reconciliation, refunds, chargebacks, reserve rules and payout review are complete.
6. Establish trusted advertising evidence and conversion providers, invalid-traffic operations, fraud review and appeals.
7. Review real jurisdiction/age/geo/KYC/KYB/privacy/prize policies and complete export/deletion/retention workflows.
8. Validate Linux container deployment on the target Abacus environment, restore drills, least-privilege credentials, alerts, runbooks and capacity.

## P1 product depth

- Quests and achievements with independently defined XP, cosmetic, Event Point and economically eligible RU effects.
- Bounded referral eligibility and reward caps, transparent attribution and abuse review.
- Creator and advertiser analytics grounded in actual validated records.
- Sponsored events and separately reserved prize liabilities with explicit payout rules.
- Creator theme customization and richer public-profile/share cards using the canonical art family.
- Richer admin profitability reporting with configurable cost estimates and operating targets.
- External social connectors with clearly recorded verification provenance.
- Deeper browser, accessibility, responsive and performance coverage.

## P2 scale when justified

Introduce durable background workers with an outbox before adding ad hoc async side effects. Add Redis or a queue only for demonstrated operational need. Evaluate domain extraction only after measured load or team ownership requires it. Preserve the monolith's economic transaction boundaries and exact deterministic behavior throughout.

Every feature affecting Money, RU, XP, Event Points, ranking or referral reward must update domain documentation, rule-version behavior and meaningful invariant tests.
