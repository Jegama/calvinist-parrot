# Local sermon evaluation recommendation

Status: implemented on `codex/sermon-eval-feature` and consolidated into the repository's canonical root development lifecycle. The Python 3.14 move was committed separately before the local runtime work.

## What local independence should look like

I recommend three explicit test levels:

| Level | Dependencies | Purpose |
|---|---|---|
| Unit/integration | Test database, fixtures | Auth, quotas, persistence, reports |
| Local end-to-end | Docker Postgres, filesystem storage, local Python worker, real Gemini | Exercise upload → queue → worker → report with the production evaluator provider |
| Cloud smoke/parity | Development Appwrite project, development Neon, real Gemini | Validate production adapters and real evaluator behavior |

To implement the independent middle layer:

1. Add `SERMON_RUNTIME=local|appwrite`.

2. Introduce storage adapters:

   - Production: existing Appwrite Storage.
   - Local: stream uploads into an ignored directory such as `.data/sermon-audio/`.

3. Introduce worker dispatch adapters:

   - Production: existing Appwrite `createExecution()`.
   - Local: leave the evaluation `QUEUED`; a local Python poller claims jobs using the existing lease tables.

4. Keep `npm run sermon:worker` for worker-only diagnostics, while the root `npm run dev` process owns Next.js and the worker and `npm run dev:local` additionally owns database startup, committed migrations, and seeds.

5. Use Gemini in every runtime. Do not expose a provider selector or maintain a second evaluator implementation for local development.

6. Add a strictly server-side development access override for `test@test.com`, guarded by `NODE_ENV === "development"`. The existing Church Finder behavior is not applied because sermon authorization only checks `sermonevaluatorbeta` and `sermonevaluatoradmin`. [Source: [auth.ts:8](/Users/omni_jgmancilla/Dev/calvinist-parrot/lib/sermon-evaluation/auth.ts:8), “only the two sermon labels grant access”]

The implementation now makes the Gemini-backed sermon worker part of normal root development and separates root and Appwrite Function environment templates. Local development retains filesystem audio and the lease-backed polling worker without maintaining a separate evaluator provider.
