# Local Development

## Diagnosis

The old workflow made production data too easy to touch by accident: `.env` could be flipped between local and production Neon URLs, and Prisma commands ran against whichever URL happened to be uncommented. That creates three risks:

- A normal `prisma migrate dev` can hit a shared or production-like database.
- Local experiments can drift away from committed migrations without CI noticing.
- Deploys can ship app code before the production database has the matching schema.

The repo also had no CI workflow, no typecheck script, no Docker database, no seed/dev-data path, and no automated test runner. `npm run lint` and `npx prisma validate` passed, but `tsc --noEmit` initially failed until the Prisma client was regenerated, which shows why CI should run `prisma generate` before TypeScript checks.

## Prerequisites

Local development uses Node.js 24, Docker, and the repository's existing Python 3.14 `cp_evals` virtualenvwrapper environment. If the Python environment does not exist yet, create it once:

```bash
mkvirtualenv -p python3.14 cp_evals
```

Install the canonical sermon evaluator into that environment from this repository:

```bash
zsh -ic 'workon cp_evals && cd services/sermon-evaluator && python -m pip install -r requirements-dev.txt && python -m pip install --no-deps -e .'
```

The root development process owns both Next.js and required local background workers. The Python package is a deployment boundary, not a separate application developers start independently.

## Local Database

Use Docker for the application database:

```bash
cp .env.template .env
npm install
npm run db:up
npm run db:deploy
npm run db:seed
npm run dev
```

Or use the one-command local path:

```bash
npm run dev:local
```

`npm run dev` starts Next.js and, when `SERMON_RUNTIME=local`, the sermon evaluation worker. The worker derives its connection from the same local `DATABASE_URL`, reads private audio from the ignored `.data/sermon-audio/` directory, and always evaluates with Gemini, so `GEMINI_API_KEY` must be configured. If either required process exits, the root supervisor stops the other instead of leaving a partially working development stack.

`npm run dev:web` is an explicit web-only diagnostic escape hatch. It does not start the sermon worker, so locally queued sermon evaluations will not complete. `npm run sermon:worker` likewise remains available for worker-only diagnostics; neither command is the canonical application startup path.

The local seed adds a `test@test.com` app database profile, four starter journal entries with precomputed AI reflections, and starter Church Finder records. It is safe to rerun: fixture records are refreshed by stable IDs or unique websites instead of duplicated.

Use the existing `test@test.com` account in the development Appwrite project to authenticate. On localhost, that account is treated as a Church Finder admin and, when `SERMON_RUNTIME=local`, a Sermon Evaluation admin. Deployed environments do not use either fallback; Church Finder uses explicit admin IDs and Sermon Evaluation uses its server-managed Appwrite labels.

The Docker compose setup creates three databases on port `54322`:

- `calvinist_parrot_dev` for normal local development.
- `calvinist_parrot_shadow` for Prisma migration diffing.
- `calvinist_parrot_test` for future integration tests.

The init script only runs when Docker creates the database volume. If you need to recreate those auxiliary databases from scratch, run `docker compose down -v` and then `npm run db:up`.

Do not put production credentials in `.env`. Keep production database credentials in Vercel and GitHub Environments only.

### Codex worktrees

Codex worktrees share the same Docker Postgres container and volume, but each worktree is provisioned with its own development, shadow, and test databases. The database names use a stable hash of `CODEX_WORKTREE_PATH`, so returning to the same worktree reconnects to the same isolated data while parallel worktrees cannot migrate or reset each other's databases.

The local-environment setup runs:

```bash
docker compose up -d --wait postgres
npm run db:worktree:setup
npm run db:deploy
npm run db:generate
npm run db:seed
```

`db:worktree:setup` creates databases named like:

```text
calvinist_parrot_dev_a1b2c3d4e5f6
calvinist_parrot_shadow_a1b2c3d4e5f6
calvinist_parrot_test_a1b2c3d4e5f6
```

It then generates the worktree's `.env` from `.env.template`, replacing only the three local database URLs. To provide API keys and other local or staging credentials, create an ignored `.env.worktree.local` in the local checkout. The tracked `.worktreeinclude` copies it into new Codex-managed worktrees, and the setup copies it to `.env.local`. The setup rejects `DATABASE_URL`, `SHADOW_DATABASE_URL`, or `TEST_DATABASE_URL` in the credential overlay so it cannot replace the isolated local URLs. Never put a production database URL in that file.

After worktree setup, `npm run dev` starts the same Next.js-plus-worker process topology as the primary checkout.

The isolated databases remain in the shared Docker volume after a worktree is removed so an accidental cleanup cannot destroy another active agent's data. `docker compose down` still stops the shared Postgres service for every worktree, and `docker compose down -v` deletes all local and worktree databases, so do not run those commands while another worktree is active.

Before removing a completed worktree, use the repository-local `$teardown-worktree` skill. It first previews the exact path-derived databases:

```bash
CODEX_WORKTREE_PATH="/absolute/path/to/worktree" npm run db:worktree:teardown -- --dry-run
```

After explicit confirmation, it runs the same command with `--confirm <worktree-id>`, drops only that worktree's development, shadow, and test databases, and then removes the Git worktree from a surviving checkout. Dropping those isolated databases removes all tables and local data created for the job. The command refuses primary checkouts, mismatched paths, non-generated database environments, and incorrect confirmation IDs. It never removes the shared Docker volume or touches production, Neon, or CCEL databases.

When two branches add migrations independently, rebase or merge them and validate the combined migration directory against a fresh database before production deployment. Database isolation prevents local interference, but it does not resolve conflicting SQL or migration ordering automatically.

## Migrations

Routine startup uses `npm run db:deploy` to apply committed migrations without entering Prisma's schema-authoring workflow. Use `npm run db:migrate` locally only after changing `prisma/schema.prisma`; it should target the Docker development and shadow databases from `.env`.

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

Appwrite should also be split by environment. Local development should use a dev Appwrite project or a clearly marked staging project, not production. Appwrite remains the application's authentication provider locally; Sermon Evaluation does not require local Appwrite Storage or a local Appwrite Function.

The root `.env.template` contains variables consumed by the Next.js application and its local processes. In Vercel, set `SERMON_RUNTIME=appwrite` plus the server-only sermon Function and bucket IDs. Variables consumed inside the deployed Python Function are intentionally separate in `services/sermon-evaluator/.env.template` and must be configured in Appwrite, not Vercel.

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
