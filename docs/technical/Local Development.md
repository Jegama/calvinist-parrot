# Local Development

## Diagnosis

The old workflow made production data too easy to touch by accident: `.env` could be flipped between local and production Neon URLs, and Prisma commands ran against whichever URL happened to be uncommented. That creates three risks:

- A normal `prisma migrate dev` can hit a shared or production-like database.
- Local experiments can drift away from committed migrations without CI noticing.
- Deploys can ship app code before the production database has the matching schema.

The repo also had no CI workflow, no typecheck script, no Docker database, no seed/dev-data path, and no automated test runner. `npm run lint` and `npx prisma validate` passed, but `tsc --noEmit` initially failed until the Prisma client was regenerated, which shows why CI should run `prisma generate` before TypeScript checks.

## Local Database

Use Docker for the application database:

```bash
cp .env.template .env
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Or use the one-command local path:

```bash
npm run dev:local
```

The local seed adds a `test@test.com` app database profile, four starter journal entries with precomputed AI reflections, and starter Church Finder records. It is safe to rerun: fixture records are refreshed by stable IDs or unique websites instead of duplicated.

On localhost, the seeded `test@test.com` Appwrite user is treated as a Church Finder admin so local developers can re-evaluate and delete church records. Deployed environments do not use that fallback; set `ADMIN_ID` and `NEXT_PUBLIC_ADMIN_ID` explicitly for real admin access.

The Docker compose setup creates three databases on port `54322`:

- `calvinist_parrot_dev` for normal local development.
- `calvinist_parrot_shadow` for Prisma migration diffing.
- `calvinist_parrot_test` for future integration tests.

The init script only runs when Docker creates the database volume. If you need to recreate those auxiliary databases from scratch, run `docker compose down -v` and then `npm run db:up`.

Do not put production credentials in `.env`. Keep production database credentials in Vercel and GitHub Environments only.

## Migrations

Use `npm run db:migrate` locally after changing `prisma/schema.prisma`. This should target the Docker database from `.env`.

Use `npm run db:deploy` only for deploy-style migration application. The manual GitHub workflow `Deploy Prisma Migrations` expects a protected `PRODUCTION_DATABASE_URL` secret and runs `prisma migrate deploy` against production. For Neon, that secret should be the direct database connection string, not a transaction-pooler URL.

The safest production flow is:

1. CI validates the branch against a disposable Postgres service.
2. Production migration workflow runs with GitHub Environment approval.
3. Vercel deploys the app after migrations succeed.

If Vercel is currently auto-deploying on push, either move production deploys into GitHub Actions or use a release branch/manual promotion so schema changes do not race app deploys.

## External Services

The local Docker database is only the application database. `CCEL_URL` is a separate PGVector store used by `utils/langChainAgents/tools/ccelRetrievalTool.ts`.

For local development, use one of these options:

- Leave `CCEL_URL` blank and avoid flows that call CCEL retrieval.
- Use a read-only dev/staging CCEL database.
- Create a local CCEL seed process later for `data_ccel_vector_store`.

Appwrite should also be split by environment. Local development should use a dev Appwrite project or a clearly marked staging project, not production.

## CI

`.github/workflows/ci.yml` now runs on pull requests and pushes to `main`/`master`:

```bash
npm ci
npx prisma migrate deploy
npm run lint
npm run typecheck
npm run build
```

The workflow uses a disposable Postgres container with the same migration path production uses. Build-time secrets are placeholders so the app can compile without touching real AI, Appwrite, Tavily, or Geo APIs.

## Testing Plan

Start small, then widen coverage around the risky seams:

- Unit tests for pure helpers: `utils/parseReference.ts`, `utils/ageUtils.ts`, `utils/badges.ts`, schemas in `lib/schemas/**`, and prompt mappers.
- Integration tests for route handlers using `TEST_DATABASE_URL`, especially journal, prayer tracker, kids discipleship, and church finder ownership checks described in `.github/instructions/**`.
- Streaming contract tests for NDJSON/JSONL event types from journal, kids discipleship, and chat.
- Playwright smoke tests for auth gating, chat start/continue, journal entry creation, prayer request creation, kids log creation, and church finder filters.

The `.github/instructions` files are useful as acceptance criteria: auth must use `requireAuthenticatedUser`, route ownership must be verified server-side, query keys must stay consistent, and streamed event names must remain stable.
