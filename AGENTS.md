# Ruvora engineering rules

GitHub is canonical; work on a dedicated feature branch. Read PROJECT_MEMORY.md before major work. Read ECONOMY.md and RU_ENGINE.md before changing Reward Units, LEDGER.md before financial code, and VISUAL_ASSET_MANIFEST.md before generating or replacing assets.

Never silently rewrite finalized economic history. Never directly mutate monetary balances. Money, RU, XP and Event Points are separate systems. Never bypass server-side authorization or weaken financial integrity. Economic changes must be exact, versioned, transactional and audited.

All user-facing interface strings belong in the EN/FR dictionaries. User-authored content is not translated. Never replace canonical Ruvora visuals with generic assets. Preserve mobile usability, keyboard access and reduced motion.

Run the documented checks before claiming success. Report actual results and update documentation after architectural changes. Do not claim production readiness, legal certification, live payments, model provenance or browser validation without evidence. Development financial data must be visibly labelled and isolated from production.

Next.js dependency documentation is installed at `node_modules/next/dist/docs`. Consult the version-matched guide before changing framework APIs. Keep source formatted with `pnpm format`.
