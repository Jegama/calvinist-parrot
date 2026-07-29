# Calvinist Parrot Sermon Evaluator

This directory is the canonical, platform-neutral Python sermon evaluator copied from CP-Evals-Lab commit `4fc02cb2da2c7c8c51ac84558bf9f592cf2d0485`. `SOURCE_PROVENANCE.json` records the one-time source map and hashes. The copied prompt, rubric, calibration, aggregation, confidence weighting, feedback synthesis, and report behavior remain available through the compatibility CLI, while `entrypoints/appwrite.py` is the Appwrite deployment adapter and `sermon_evaluator.worker` is the local polling adapter around the same package.

## Runtime boundaries

- Next.js authenticates and authorizes users, reserves lifetime run credits, creates durable Postgres jobs, and dispatches them to the selected runtime with only an opaque `evaluationId`.
- This Function reads the private Appwrite audio file with Appwrite's injected dynamic API key, verifies its bytes and duration, calls Gemini, and writes only sermon tables through a dedicated pooled Neon URL.
- The local runtime reads ignored filesystem audio, polls the same lease-backed queue, and uses deterministic fixture responses by default. It requires neither Appwrite Storage, an Appwrite Function, Neon, nor Gemini.
- Prisma is the sole schema and migration owner. Python has no migration framework.
- Production uses `gemini-3.6-flash`, medium thinking, structured output, and Gemini Files. The CLI model override is developer-only.
- One Appwrite execution has a 900-second hard timeout and an 840-second soft deadline. A call is not started with less than 60 seconds remaining.
- Scoring runs execute concurrently in waves. Primary seeds preserve CP-Evals order; up to two deterministic replacement attempts are allowed for each failed logical slot.

## Environment contract

Appwrite supplies `APPWRITE_FUNCTION_API_ENDPOINT`, `APPWRITE_FUNCTION_PROJECT_ID`, and `APPWRITE_FUNCTION_API_KEY`. `services/sermon-evaluator/.env.template` is the authoritative list of variables to configure separately in each development and production Function:

- `SERMON_RUNTIME`: `appwrite`.
- `SERMON_EVALUATOR_PROVIDER`: `gemini`.
- `SERMON_DATABASE_URL`: dedicated least-privileged pooled Neon URL with `sslmode=require`.
- `GEMINI_API_KEY`: worker-only Gemini key.
- `SERMON_AUDIO_BUCKET_ID`: private sermon bucket for the same environment.
- `SERMON_GEMINI_MODEL`: `gemini-3.6-flash`.
- `SERMON_SOFT_DEADLINE_SECONDS`: `840`.
- `SERMON_MAX_PARALLEL_SCORING_RUNS`: `9`.

The direct database role needs only the required DML privileges on sermon tables and their sequences. It must not receive DDL or unrelated application-table access.

## Local development

Use the repository's existing virtualenvwrapper environment:

```bash
zsh -ic 'workon cp_evals && cd services/sermon-evaluator && python -m pip install -r requirements-dev.txt && python -m pip install --no-deps -e .'
```

Run tests:

```bash
zsh -ic 'workon cp_evals && cd services/sermon-evaluator && python -m pytest'
```

The canonical application setup is documented in `docs/technical/Local Development.md`. From the repository root, normal development runs:

```bash
npm run dev
```

The root process owns both Next.js and this worker through `workon cp_evals`; this service is not started as a separate application. `npm run dev:local` additionally starts Docker Postgres, deploys committed migrations, and seeds fixtures before entering that same root process. In local runtime, audio defaults to `.data/sermon-audio/` and deterministic fixture evaluation requires no Gemini key.

For worker-only diagnostics:

```bash
npm run sermon:worker
npm run sermon:worker -- --once
```

Set `SERMON_EVALUATOR_PROVIDER=gemini` locally only when deliberately testing the real provider and supplying `GEMINI_API_KEY`.

Run the source-compatible CLI:

```bash
zsh -ic 'workon cp_evals && python -m sermon_evaluator.cli --audio data/sermons/sermon.mp3 --out-dir data/sermons_evals --label my_sermon --preacher "Name" --preached-date 2026-07-27 --num-scoring-runs 3 --markdown'
```

The CLI preserves `--audio`, `--model`, `--out-dir`, `--label`, `--md-file`, `--preacher`, `--markdown`, and `--num-scoring-runs`, and adds `--preached-date` plus the off-by-default `--apply-duration-adjustment`. Historic `<label>_step1_extraction.json` and `<label>_step2_scoring.json` filenames contain append-only newline-delimited JSON records. It also appends `sermon_aggregated_summary.csv` and optionally writes `<label>.md`.

## Dependency lock regeneration

Python 3.14 is required. `pyproject.toml` owns direct dependencies; committed lock inputs are regenerated with:

```bash
python -m piptools compile --resolver=backtracking --strip-extras -o requirements.txt pyproject.toml
python -m piptools compile --resolver=backtracking --strip-extras --extra dev -o requirements-dev.txt pyproject.toml
```

## Deployment

The root `appwrite.json` configures `services/sermon-evaluator` as a Python 3.14 Function, installs the pinned production requirements and package, exposes no public execute role, grants the dynamic key only file read/write scopes, runs recovery once per minute, and sets the 900-second timeout. Project IDs and all secrets remain deployment-environment configuration.

The scheduled empty-body invocation marks expired attempts timed out, removes soft-deleted Appwrite audio before clearing its database pointer, and resumes a bounded number of queued or lease-expired evaluations without extending their original deadline. A normal direct invocation body is:

```json
{"evaluationId":"opaque-database-id"}
```

After the control plane updates the duration-policy fields, it may regenerate immutable reports without Gemini:

```json
{"action":"regenerate_reports","evaluationId":"opaque-database-id"}
```

`action` defaults to `evaluate`; those are the only accepted actions. The entrypoint never accepts an owner, role, model, status, run count, or Appwrite execution identifier from the caller.
