# Ruvora

Ruvora is an independent creator economy and gamification platform. Creators publish a Ruvora Link, audiences participate in eligible campaigns and events, and advertisers fund legitimate engagement. Access from a small audience is a feature threshold, never a promise of income.

This repository contains a production-oriented first vertical slice. It is a development foundation with explicit launch gates. It does not process live payments or payouts. Seeded economic values are simulated.

## Stack and boundaries

Next.js 16.3.5, React 19.3.0, TypeScript, Tailwind CSS 4.3.3, Prisma 7.10.0, PostgreSQL 18, Node.js 24 LTS, and pnpm 11.19.0. The lockfile records resolved dependencies.

The application is a modular monolith: request handlers call server application services, which apply domain rules and persist through PostgreSQL transactions. Money, Reward Units, XP and Event Points are permanently separate. Read [ARCHITECTURE.md](ARCHITECTURE.md), [ECONOMY.md](ECONOMY.md), [RU_ENGINE.md](RU_ENGINE.md), and [LEDGER.md](LEDGER.md) before changing economic behavior.

## Local startup

Prerequisites: Node.js 24 and pnpm 11.19.0. The optional embedded helper packages a real PostgreSQL 18 binary for local development; production uses a normal PostgreSQL service.

1. Install dependencies: `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env`.
3. Set `DEMO_PASSWORD` in `.env` to a local-only password of at least 12 characters. No password is supplied by this repository.
4. Start PostgreSQL in a separate terminal: `pnpm db:local`.
5. Run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:seed`.
6. Start the app: `pnpm dev`.
7. Open [Ruvora locally](http://localhost:3000). Use this exact hostname because mutating requests enforce `APP_URL`.

On PowerShell, copy the example with `Copy-Item .env.example .env`. On POSIX shells, use `cp .env.example .env`. Keep the database terminal running.

The database listens on `127.0.0.1:54329`. The helper creates `ruvora` and `ruvora_test`, uses SCRAM authentication, and persists data at `.local/postgres`. Stop it with Ctrl+C or `node scripts/local-postgres.mjs --stop`. Shutdown does not delete data. A pre-existing cluster of another major version is rejected; migrate it explicitly.

### Development accounts

The development seed uses the configured `DEMO_PASSWORD` for these accounts:

| Email                               | Starting roles      |
| ----------------------------------- | ------------------- |
| alex@ruvora.test                    | User                |
| mira@ruvora.test                    | User, creator       |
| studio@ruvora.test                  | User, advertiser    |
| admin@ruvora.test                   | User, administrator |
| leon@ruvora.test / nora@ruvora.test | User, creator       |

The seed requires `ALLOW_DEV_SEED=true` and refuses production execution. Development funding requires `ALLOW_DEMO_FUNDING=true` and is disabled in production. Neither is a payment adapter. Never deploy demo accounts or local database credentials to a public production environment.

## Commands

| Command                 | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `pnpm dev`              | Development application on loopback                             |
| `pnpm build`            | Generate Prisma client and build the production application     |
| `pnpm start`            | Standard Next server; the container uses standalone `server.js` |
| `pnpm lint`             | ESLint with zero warnings                                       |
| `pnpm typecheck`        | Prisma generation, Next route types and TypeScript              |
| `pnpm test`             | Pure domain/unit tests                                          |
| `pnpm test:integration` | Database/API integration tests against the test database        |
| `pnpm test:e2e`         | Playwright browser journeys                                     |
| `pnpm db:migrate`       | Apply committed migrations with Prisma                          |
| `pnpm db:seed`          | Populate development fixtures                                   |
| `pnpm db:local`         | Supervise local PostgreSQL                                      |

See [TESTING.md](TESTING.md) for isolation requirements and [RELEASE_REPORT.md](RELEASE_REPORT.md) for exact results actually executed.

## Docker and deployment

For a PostgreSQL-only local dependency, stop `db:local` and run `docker compose up -d db`. The same host-side `DATABASE_URL` works with the default example. The named volume preserves data. The separate test database is created only when that volume is initialized.

To exercise the production container shape, run `docker compose --profile app up --build -d`. Compose waits for database health, runs migrations once, and starts the non-root standalone app. The container disables demo seed/funding paths. Do not expect the development funding journey to operate in this production-mode container.

`docker compose down` preserves data. Do not add `--volumes` unless you deliberately intend to erase the local database.

Abacus AI infrastructure / SuperComputer is the intended deployment target. The application has no proprietary hosting dependency. Follow [DEPLOYMENT_ABACUS.md](DEPLOYMENT_ABACUS.md). No remote deployment or public domain configuration is claimed.

## Repository guide

- [PRODUCT.md](PRODUCT.md): mission, roles, loops and product boundaries.
- [ARCHITECTURE.md](ARCHITECTURE.md): domain and persistence design.
- [SECURITY.md](SECURITY.md): controls, limitations and launch requirements.
- [I18N.md](I18N.md): EN/FR translation contract.
- [ROADMAP.md](ROADMAP.md): prioritized next work.
- [VISUAL_ASSET_MANIFEST.md](VISUAL_ASSET_MANIFEST.md): canonical visual assets and provenance.
- [PROJECT_MEMORY.md](PROJECT_MEMORY.md): concise context for future contributors.
- [docs/MASTER_BUILD_BRIEF.md](docs/MASTER_BUILD_BRIEF.md): original requirements.
