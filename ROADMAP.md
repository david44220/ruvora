# Roadmap

This is a prioritized continuation plan, not a list of completed features. Consult [RELEASE_REPORT.md](RELEASE_REPORT.md) for implementation and validation evidence.

## P0 completion and launch gates

1. Preserve the verified identity/profile/campaign/validated-activity/event/economy slice as production providers and operational controls are added.
2. Extend existing PostgreSQL invariant/concurrency coverage into provider reconciliation, distributed requests, sustained load and explicit accounting recovery after finalization.
3. Connect and operate external delivery for the implemented encrypted verification/recovery outbox.
4. Verify the audited first-admin bootstrap on the target infrastructure, then verify the implemented TOTP, recovery and revocation controls with real operators.
5. Implement provider-backed payments/payouts only after webhook signatures, idempotency, reconciliation, refunds, chargebacks, reserve rules and payout review are complete.
6. Establish trusted advertising evidence and conversion providers, invalid-traffic operations, fraud review and appeals.
7. Review real jurisdiction/age/geo/KYC/KYB/privacy/prize policies and complete export/deletion/retention workflows.
8. Validate Linux container deployment on the target Abacus environment, restore drills, least-privilege credentials, alerts, runbooks and capacity.

## P1 product depth

- Quests and achievements with independently defined XP, cosmetic, Event Point and economically eligible RU effects.
- Extend implemented direct referral controls with measured anti-abuse review and appeals.
- Expand existing creator/advertiser analytics with exports, cohort reporting and performance measurements.
- Extend settled sponsored events with delegated hosting, reviewed compensation and actual payout-provider delivery.
- Creator theme customization and richer public-profile/share cards using the canonical art family.
- Richer admin profitability reporting with configurable cost estimates and operating targets.
- External social connectors with clearly recorded verification provenance.
- Deeper browser, accessibility, responsive and performance coverage.

## P2 scale when justified

Operate the implemented durable inbox/outbox worker before adding ad hoc async side effects. Add Redis or a queue only for demonstrated operational need. Evaluate domain extraction only after measured load or team ownership requires it. Preserve the monolith's economic transaction boundaries and exact deterministic behavior throughout.

Every feature affecting Money, RU, XP, Event Points, ranking or referral reward must update domain documentation, rule-version behavior and meaningful invariant tests.
