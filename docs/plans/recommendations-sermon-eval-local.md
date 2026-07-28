# Local sermon evaluation recommendation

Status: implemented on `codex/sermon-eval-feature`. The Python 3.14 move was committed separately before the local runtime work.

## What local independence should look like

I recommend three explicit test levels:

| Level | Dependencies | Purpose |
|---|---|---|
| Unit/integration | Test database, fixtures | Auth, quotas, persistence, reports |
| Local end-to-end | Docker Postgres, filesystem storage, local Python worker, fake Gemini provider | Exercise upload → queue → worker → report without cloud infrastructure |
| Cloud smoke/parity | Development Appwrite project, development Neon, real Gemini | Validate production adapters and real evaluator behavior |

To implement the independent middle layer:

1. Add `SERMON_RUNTIME=local|appwrite`.

2. Introduce storage adapters:

   - Production: existing Appwrite Storage.
   - Local: stream uploads into an ignored directory such as `.data/sermon-audio/`.

3. Introduce worker dispatch adapters:

   - Production: existing Appwrite `createExecution()`.
   - Local: leave the evaluation `QUEUED`; a local Python poller claims jobs using the existing lease tables.

4. Add a local Python command such as `npm run sermon:worker` and a combined `npm run dev:sermon` that starts Postgres, migrations, Next.js, and the worker.

5. Add `SERMON_EVALUATOR_PROVIDER=fixture|gemini`. Fixture mode would complete deterministic UI testing without Gemini cost; real Gemini remains available for a deliberate smoke test.

6. Add a strictly server-side development access override for `test@test.com`, guarded by `NODE_ENV === "development"`. The existing Church Finder behavior is not applied because sermon authorization only checks `sermon-evaluator-beta` and `sermon-evaluator-admin`. [Source: [auth.ts:8](/Users/omni_jgmancilla/Dev/calvinist-parrot/lib/sermon-evaluation/auth.ts:8), “only the two sermon labels grant access”]

The implementation now provides `npm run sermon:worker` and `npm run dev:sermon`, separates the local and deployed environment contracts in `.env.template`, and includes an opt-in Docker Postgres end-to-end test that verifies local WAV storage through completed fixture reports.
