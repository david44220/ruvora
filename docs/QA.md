# Ruvora development validation

The [qa directory](qa/) holds actual Chromium screenshots of the local development build. Accounts, campaigns, activities and monetary figures shown are development fixtures. These are screenshots of rendered application code, not UI mockups or generated interface art.

The canonical raster artwork has separate provenance in [ARTWORK-PROVENANCE.md](ARTWORK-PROVENANCE.md) and [VISUAL_ASSET_MANIFEST.md](../VISUAL_ASSET_MANIFEST.md).

The release report records the completed test counts and known launch limitations. Browser screenshots are evidence of the inspected viewport, not a claim of WCAG conformance or performance certification.

## Pass 02 — 14 September 2026

The [Pass 02 evidence](qa/pass02/) contains inspected desktop/mobile profile, creator, security, event and wallet captures, the rendered 1200×630 share image, actual zero-overflow/page-error results and the clean/upgrade migration audit. Economic figures and identities are isolated development fixtures. Security evidence shows the resting account screen only; no authenticator secret, recovery code or security token is included.

The sponsored event proof shows a funded €10.01 reserve settled into one €6.01 winner credit and a €4.00 sponsor return, with final ranking frozen. These are real internal PostgreSQL ledger records backed by simulated development funds. No external payout took place. See [the current release report](../RELEASE_REPORT.md) for exact test and GitHub CI results.
