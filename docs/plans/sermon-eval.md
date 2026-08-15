# Canonical Sermon Evaluation Service

## Summary and locked decisions

- Move the sermon evaluator from CP-Evals-Lab into Calvinist Parrot through a one-time, provenance-recorded copy. Calvinist Parrot becomes the only maintained implementation after production parity is proven.
- Preserve the Python evaluator kernel while replacing the production CLI and local-file shell with Appwrite Storage, an asynchronous Appwrite Python Function, direct pooled Neon persistence, and a protected Next.js experience.
- Keep the evaluator package platform-neutral under `services/sermon-evaluator/`; configure that directory as the Appwrite Function root rather than making Appwrite deployment folders the package boundary.
- Use stable `gemini-3.6-flash` for all v1 production evaluations. [Gemini 3.6 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash)
- Store sermon audio in a private Appwrite bucket with a 100 MiB (`104,857,600` byte) maximum and a three-hour duration maximum. The earlier 500 MB proposal is rejected.
- Hash audio in the browser before requesting upload authorization. When the authenticated owner has already submitted the same exact bytes, do not upload another copy; return the latest evaluation for that audio and route the user to its detail page.
- Give each owner-plus-audio-hash combination nine lifetime scoring-run credits, including the original evaluation. Standard costs one credit, High confidence costs three, mixed preset use deducts the actual requested runs, and retry attempts for the same evaluation consume no additional credits.
- Run Standard, High-confidence, and admin-configured scoring runs concurrently, never sequentially. Standard uses one scoring run, High confidence uses three, and admins may request one through nine concurrent runs.
- Give each evaluation attempt a 900-second hard Appwrite timeout and an 840-second soft deadline. The worker must persist a terminal or resumable state before the hard timeout; it must not begin a new external call when the remaining soft-deadline budget is insufficient.
- Use direct pooled Neon access from Python through a dedicated, least-privileged `SERMON_DATABASE_URL`. Prisma remains the only schema and migration owner.
- Make the sermon-length adjustment optional and off by default. Preserve the existing formula for churches or users that explicitly enable it.
- After production parity is proven, open a CP-Evals-Lab issue to retire the duplicate implementation; removal happens in a separate reviewed PR.

## Runtime decision: Appwrite worker with Vercel control plane

- Keep the Next.js frontend, authenticated APIs, OpenAPI contracts, and the existing devotional cron on Vercel.
- Keep the sermon worker on Appwrite because:
  - The browser already uploads audio directly to Appwrite Storage, so a same-provider Appwrite worker avoids downloading every 100 MiB file across providers before sending it to Gemini.
  - Appwrite asynchronous executions provide the required background queue without holding a Vercel request open. [Appwrite execution modes](https://appwrite.io/docs/products/functions/execute)
  - Appwrite’s 900-second function maximum is sufficient for the explicit 15-minute evaluation-attempt budget. [Appwrite Function timeout](https://appwrite.io/docs/products/functions/functions)
  - The worker can use an Appwrite dynamic API key with least-privilege Storage scopes and does not need a user session or a public function domain.
- Do not move the existing daily devotional cron as part of this project. `vercel.json` continues to schedule `/api/cron/devotional`; sermon evaluation is a separate workload and deployment decision.
- Do not add a Vercel Python entrypoint. Vercel remains the control plane that authenticates users, writes the initial Neon job record, and invokes the Appwrite Function asynchronously with an opaque evaluation ID.

## Source baseline, provenance, and compatibility

- Copy from the clean CP-Evals-Lab source baseline commit `4fc02cb2da2c7c8c51ac84558bf9f592cf2d0485`.
- Record the source-to-target file map and SHA-256 hashes in `services/sermon-evaluator/SOURCE_PROVENANCE.json`.
- Transfer only the sermon-specific implementation:
  - `cp_eval_sermons.py`
  - `parrot_ai/sermon_evals/engine.py`
  - `parrot_ai/sermon_evals/audio_utils.py`
  - `parrot_ai/sermon_evals/aggregation.py`
  - `parrot_ai/sermon_evals/calibration.py`
  - `parrot_ai/sermon_evals/harmonization.py`
  - `parrot_ai/sermon_evals/markdown.py`
  - The sermon classes from `parrot_ai/evaluation_schemas.py`
  - `parrot_ai/prompts/sermon.py`
  - `tests/test_sermon_calibration.py`
- Extract only the required Gemini adapter from `parrot_ai/core.py`; do not copy unrelated providers or the shared core.
- Map the source CLI entrypoint `/Users/omni_jgmancilla/Dev/CP-Evals-Lab/cp_eval_sermons.py:main` to `services/sermon-evaluator/src/sermon_evaluator/cli.py:main`, and expose it as the `cp-eval-sermons` console script in `pyproject.toml`.
- Keep `services/sermon-evaluator/entrypoints/appwrite.py` as a thin deployment adapter that exposes Appwrite’s `main(context)` function, validates the invocation payload, and delegates to the same platform-neutral service used by the CLI.
- Preserve the existing CLI compatibility flags in the new local runner:
  - `--audio`
  - `--model`
  - `--out-dir`
  - `--label`
  - `--md-file`
  - `--preacher`
  - `--markdown`
  - `--num-scoring-runs`
- Add optional local-runner flags:
  - `--preached-date YYYY-MM-DD`
  - `--apply-duration-adjustment`, defaulting to off
- Preserve the old parity outputs and append behavior: `<label>_step1_extraction.json`, `<label>_step2_scoring.json`, `sermon_aggregated_summary.csv`, and optional `<label>.md`. Document that the two `.json` compatibility files contain newline-delimited records even though the historic filenames use `.json`.
- Production APIs do not accept a model override. The `--model` flag remains developer-only for source parity and controlled experiments.

## Target repository structure

```text
calvinist-parrot/
├── appwrite.json
├── .env.template
├── services/
│   └── sermon-evaluator/
│       ├── .python-version
│       ├── pyproject.toml
│       ├── requirements.txt
│       ├── requirements-dev.txt
│       ├── README.md
│       ├── SOURCE_PROVENANCE.json
│       ├── entrypoints/
│       │   └── appwrite.py
│       ├── src/
│       │   └── sermon_evaluator/
│       │       ├── __init__.py
│       │       ├── cli.py
│       │       ├── service.py
│       │       ├── stages.py
│       │       ├── schemas.py
│       │       ├── prompts.py
│       │       ├── gemini.py
│       │       ├── audio.py
│       │       ├── aggregation.py
│       │       ├── calibration.py
│       │       ├── harmonization.py
│       │       ├── persistence.py
│       │       ├── storage.py
│       │       └── reports/
│       │           ├── __init__.py
│       │           ├── markdown.py
│       │           ├── json_report.py
│       │           └── csv_report.py
│       └── tests/
│           ├── test_sermon_calibration.py
│           ├── test_aggregation.py
│           ├── test_harmonization.py
│           ├── test_parallel_scoring.py
│           ├── test_retry_seeds.py
│           ├── test_cli_contract.py
│           ├── test_reports.py
│           ├── test_gemini_adapter.py
│           ├── test_persistence.py
│           └── test_stage_machine.py
├── app/
│   ├── sermon-evaluation/
│   │   ├── page.tsx
│   │   └── [evaluationId]/
│   │       └── page.tsx
│   └── api/v1/sermon-evaluations/
├── lib/
│   ├── api/contracts/sermon-evaluations.ts
│   └── sermon-evaluation/
│       ├── auth.ts
│       ├── appwrite.ts
│       ├── fingerprints.ts
│       ├── hash.worker.ts
│       ├── quotas.ts
│       └── types.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── tests/
    └── sermon-evaluations/
        ├── uploads.test.ts
        ├── run-credits.test.ts
        └── reevaluate.test.ts
```

## Python packaging, dependencies, and developer workflow

- Use Python 3.14 in `.python-version`, Appwrite, and CI.
- Treat `pyproject.toml` as the package and direct-dependency definition, including `[project.scripts] cp-eval-sermons = "sermon_evaluator.cli:main"`.
- Commit a pinned production `requirements.txt` generated from the tested `pyproject.toml` with `pip-compile -o requirements.txt pyproject.toml`, and a pinned `requirements-dev.txt` generated with `pip-compile --extra dev -o requirements-dev.txt pyproject.toml`.
- Keep the production dependency set sermon-specific:
  - `appwrite`
  - `google-genai`
  - `pydantic`
  - `mutagen`
  - `psycopg[binary,pool]`
- Keep `python-dotenv`, `pytest`, `pytest-cov`, and `pip-tools` in the `dev` optional dependency group and development requirements only.
- Do not copy CP-Evals-Lab’s broad requirements containing unrelated OpenAI, Anthropic, xAI, Together, Transformers, Pandas, Streamlit, or watchdog dependencies.
- Configure the Appwrite Function with:
  - Root directory: `services/sermon-evaluator`
  - Runtime: Python 3.14
  - Entrypoint: `entrypoints/appwrite.py`
  - Build command: `pip install --no-cache-dir -r requirements.txt && pip install --no-deps .`
  - Timeout: `900`
  - Execute access: empty; invoke it only through the server-side Appwrite API key, scheduled recovery execution, or Appwrite internal triggers
- Use the existing virtualenvwrapper environment locally:

```bash
zsh -ic 'workon cp_evals && cd services/sermon-evaluator && python -m pip install -r requirements-dev.txt && python -m pip install --no-deps -e .'
```

- Run the compatibility CLI locally with:

```bash
zsh -ic 'workon cp_evals && python -m sermon_evaluator.cli --audio data/sermons/sermon.mp3 --out-dir data/sermons_evals --label my_sermon --preacher "Name" --preached-date 2026-07-27 --num-scoring-runs 3 --markdown'
```

- Add a Python 3.14 job to `.github/workflows/ci.yml` that installs from `requirements-dev.txt`, installs the package editable without resolving a second dependency graph, runs the sermon test suite, and verifies that the Appwrite entrypoint imports successfully. CI must not depend on `workon cp_evals`.
- Add `node-appwrite` to the Next.js application for server-side Function invocation and expiring file-token creation. Add a small audited incremental SHA-256 implementation such as `hash-wasm` for browser-side streaming hashing in a Web Worker.

## Deployment configuration and environment contract

- Commit a nonsecret root `appwrite.json` that defines the sermon-evaluator Python Function, `services/sermon-evaluator` root, `entrypoints/appwrite.py` entrypoint, install command, 900-second timeout, empty public execute access, Storage scopes, and once-per-minute recovery schedule. Manage development and production project IDs through the deployment environment rather than embedding production secrets in the manifest.
- Document configuration according to its runtime owner; never commit values:
  - Root `.env.template`: local `SERMON_RUNTIME` default and `GEMINI_API_KEY` placeholder plus Vercel/Next.js `APPWRITE_SERMON_FUNCTION_ID` and `APPWRITE_SERMON_BUCKET_ID`, alongside the existing server-side Appwrite endpoint, project ID, and API key. The server key receives only the Function-execution, file-metadata, and file-token capabilities required by the API routes.
  - `services/sermon-evaluator/.env.template`: Appwrite Function `SERMON_RUNTIME`, `SERMON_DATABASE_URL`, `GEMINI_API_KEY`, `SERMON_AUDIO_BUCKET_ID`, `SERMON_GEMINI_MODEL`, `SERMON_SOFT_DEADLINE_SECONDS`, and `SERMON_MAX_PARALLEL_SCORING_RUNS`.
- Appwrite user labels are literal strings rather than separately provisioned resources with IDs. Define `sermon-evaluator-beta` and `sermon-evaluator-admin` once as exported constants in `lib/sermon-evaluation/auth.ts`; do not add label-ID environment variables.
- Use Appwrite’s injected Function endpoint, project ID, and dynamic API key inside the worker. Grant that dynamic key only the scopes needed to read sermon audio and its metadata; do not configure a second long-lived Appwrite API key in the Function.
- Use distinct bucket IDs, Function IDs, Neon pooled URLs, Gemini credentials or quota projects, and API keys for development and production. Preview Vercel deployments may target development resources only; production resources are available only to the production Vercel environment and production Appwrite Function.
- Only the Appwrite worker reads `GEMINI_API_KEY` for sermon evaluation. Existing Vercel features may retain their own Gemini configuration, but the sermon control-plane routes must never call Gemini or download sermon audio.

## Sermon-specific access and admin provisioning

- Use two server-managed Appwrite user labels for this feature:
  - `sermon-evaluator-beta`: may access the protected feature and use the regular Standard/High-confidence product rules.
  - `sermon-evaluator-admin`: implies beta access, enables the one-through-nine run selector, and may bypass the global daily quota; it never bypasses the nine-credit lifetime limit for a sermon fingerprint.
- Provision or revoke sermon administrators manually through the Appwrite Console in the correct development or production project:
  1. Open the Appwrite Console’s Auth user list and select the intended existing user.
  2. Add the exact `sermon-evaluator-admin` label while preserving every label already on the user. No separate label object or label ID must be created.
  3. Have the user refresh their authenticated session or sign out and back in, then verify the server-derived sermon capabilities before relying on the admin UI.
  4. Remove the label to revoke sermon-admin capabilities. Revocation blocks new admin actions on the next authenticated server check; an already-queued owner-scoped evaluation may finish normally.
- Appwrite labels are intended for granting labeled users access to resources. Label mutation remains a privileged Console or Users API operation and must never be exposed through a Calvinist Parrot client or public route. [Appwrite labels](https://appwrite.io/docs/products/auth/labels) [Appwrite user administration](https://appwrite.io/docs/products/auth/users)
- Do not add an in-product “make admin” screen or admin-management API in v1. Appwrite project operators are the only people who can grant or revoke the label.
- Implement feature-local helpers in `lib/sermon-evaluation/auth.ts`:
  - `hasSermonEvaluationAccess(user)` returns true for either exact label.
  - `isSermonEvaluationAdmin(user)` returns true only for `sermon-evaluator-admin`.
  - `requireSermonEvaluationAccess()` and `requireSermonEvaluationAdmin()` read the authenticated Appwrite user on the server and reject absent labels with `403`.
- Never trust a submitted `isAdmin`, requested role, client-supplied label list, or custom run count. All admin-only request fields are accepted only after the server re-derives the capability from the authenticated Appwrite user.
- Return a derived `capabilities` object to the sermon UI with `hasAccess`, `isAdmin`, `canChooseCustomRunCount`, `dailyQuotaExempt`, and the allowed run-count range. Client-side capability checks control presentation only; every API enforces the same rule server-side.
- Keep the repository’s existing `ADMIN_ID`, `NEXT_PUBLIC_ADMIN_ID`, local `test@test.com` fallback, and `lib/admin.ts` behavior unchanged for Church Finder and every other existing feature. Sermon-evaluator routes do not use that ID-based predicate, and an existing `ADMIN_ID` user must receive `sermon-evaluator-admin` separately to gain sermon-admin capabilities.
- Record each custom admin run selection and daily-quota exemption with the authenticated Appwrite user ID, evaluation ID, requested run count, reason code, and timestamp.

## Canonical evaluator behavior

- Preserve:
  - Step 1 sermon structure, proposition, Fallen Condition Focus, points, applications, illustrations, comments, and extraction confidence.
  - Step 2’s 28 subcriteria, seven section scores, strengths, growth areas, next steps, and scoring confidence.
  - Six aggregate metrics and the existing “Pillars First” Overall Impact weighting.
  - Confidence-weighted multi-run numeric harmonization and LLM-synthesized feedback.
  - The existing post-processing order: strict calibration, ceiling compression, aggregate computation, optional duration adjustment, and aggregate feedback.
  - Markdown, JSON, and CSV reporting.
- Use `SERMON_GEMINI_MODEL=gemini-3.6-flash`, `thinking_level="medium"`, structured output, and Gemini Files. Omit deprecated `temperature`, `top_p`, and `top_k`, remove unsupported `candidate_count`, and do not end requests with a prefilled model turn. [Gemini 3.6 migration guidance](https://ai.google.dev/gemini-api/docs/generate-content/latest-model)
- Record the configured model alias, model version returned by Gemini, response IDs where available, evaluator version, prompt version, rubric version, report version, and original CP-Evals commit on every evaluation.
- Store Gemini file name, URI, MIME type, creation time, and expiry time. Gemini files are temporary; if the file is absent, failed, or expired, re-upload from Appwrite Storage and atomically replace the persisted Gemini-file metadata.
- Use `mutagen` as the canonical duration reader in production for MP3, M4A, and WAV so the worker does not depend on an unprovisioned `ffprobe` binary. Keep duration extraction deterministic and covered with representative fixtures.

## Parallel scoring, seeds, retries, and the 15-minute budget

- Perform Step 1 extraction once.
- Start all requested Step 2 scoring runs concurrently in one scoring stage:
  - Standard: one concurrent slot
  - High confidence: three concurrent slots
  - Admin: one through nine concurrent slots
- Set `SERMON_MAX_PARALLEL_SCORING_RUNS=9`. Use a bounded thread pool because Gemini calls are I/O-bound; never loop through requested scoring runs sequentially.
- Preserve the existing nine seeds for each run’s first attempt in the same ordinal order.
- Persist `sermonScoringRun` and `sermonScoringAttempt` records before dispatching provider calls.
- Give each failed scoring slot at most two replacement attempts while the soft deadline allows. Wave one launches every slot’s primary attempt concurrently; wave two launches one replacement for every still-failed slot concurrently; wave three does the same for slots still failing. Never run multiple attempts for the same logical slot at once.
- Generate replacement seeds deterministically from the evaluation ID, scoring-run ordinal, attempt number, and prompt version using SHA-256. Convert the digest to a positive 31-bit integer, reject collisions against every seed already persisted for the evaluation, and persist the selected seed before invoking Gemini. Do not use Python’s process-randomized `hash()`.
- Do not start harmonization until every requested slot is terminal for the current retry policy.
- If at least one run succeeds but fewer than requested succeed, continue as `COMPLETE_WITH_WARNINGS`, store `requestedRuns` and `completedRuns`, and describe the reduced confidence in the UI and reports. If no scoring run succeeds, fail the evaluation.
- Set the Appwrite hard timeout to 900 seconds and `SERMON_SOFT_DEADLINE_SECONDS=840`.
- Before each external call, calculate the remaining soft-deadline budget and pass a provider timeout no greater than that remaining budget. Do not begin another provider call when fewer than 60 seconds remain.
- If the soft deadline is reached, persist `TIMED_OUT` with error code `EVALUATION_DEADLINE_EXCEEDED`, release the worker lease, and return normally before Appwrite terminates the process. Do not automatically extend a single evaluation attempt beyond 15 minutes.
- A user-initiated retry of a failed or timed-out evaluation creates a new attempt on that same evaluation with a fresh 15-minute budget, reuses completed deterministic stages and a still-valid Gemini file when safe, and never consumes additional per-sermon run credits. Re-evaluating a completed sermon is a different action that creates a new evaluation and consumes new credits.

## Durable job state machine and worker coordination

- Use these persisted statuses:
  - `QUEUED`
  - `PREPARING_AUDIO`
  - `EXTRACTING`
  - `SCORING`
  - `HARMONIZING`
  - `CALIBRATING`
  - `SUMMARIZING`
  - `COMPLETE`
  - `COMPLETE_WITH_WARNINGS`
  - `FAILED`
  - `TIMED_OUT`
  - `CANCELED`
- Process stages in this order:
  1. `PREPARING_AUDIO`: claim a global worker slot, stream the Appwrite file to temporary storage, verify file metadata and SHA-256, extract duration, and create or recover the Gemini file.
  2. `EXTRACTING`: run and persist Step 1.
  3. `SCORING`: create all scoring-run attempts, execute them concurrently, and persist each result independently.
  4. `HARMONIZING`: confidence-weight numeric results and synthesize multi-run feedback; skip the multi-run LLM harmonizer when exactly one run completed.
  5. `CALIBRATING`: apply strict calibration, ceiling compression, six aggregates, base Overall Impact, calculated duration penalty, and adjusted Overall Impact.
  6. `SUMMARIZING`: generate aggregate coaching feedback and immutable report snapshots.
  7. Mark `COMPLETE` or `COMPLETE_WITH_WARNINGS` in the same transaction that publishes the final result.
- Give `sermonEvaluation` a monotonically increasing `version`. Every stage transition uses compare-and-set semantics on `{id, version, status}` so duplicate Appwrite executions cannot advance the same stage twice.
- Persist each completed stage output before moving to the next stage. A resumed execution skips completed deterministic stages and only repeats an external side effect whose success was not durably recorded.
- Check `cancelRequestedAt` before every external call and immediately after every external response. An in-flight Gemini request may finish, but its result must not advance a canceled evaluation.
- Enforce two global evaluation workers through a `sermonWorkerLease` table containing exactly two slots. Claim a free or expired slot atomically, heartbeat every 30 seconds, set the lease expiry far enough ahead to survive brief pauses, and release it on every terminal or graceful-return path.
- Two active nine-run evaluations can produce at most 18 concurrent Gemini scoring calls. Verify production Gemini quota and connection capacity for that bound; if capacity is lower, reduce the number of global evaluation-worker slots without serializing the requested runs inside an individual evaluation.
- Enforce one active evaluation per owner with a partial unique PostgreSQL index covering all nonterminal statuses.
- Invoke the worker asynchronously immediately after creating a job. Also configure a once-per-minute Appwrite scheduled recovery invocation that finds queued work or expired leases and performs bounded cleanup of expired upload reservations. Recovery may resume only while the evaluation attempt’s original 15-minute deadline is still open; otherwise it marks the attempt `TIMED_OUT`.

## Direct pooled Neon access from Python

- Add `SERMON_DATABASE_URL` to the Appwrite Function environment. Use the Neon pooled connection endpoint with `sslmode=require`; do not reuse or expose the Next.js `DATABASE_URL`.
- Create a dedicated Neon role limited to `SELECT`, `INSERT`, `UPDATE`, and required `DELETE` operations on the sermon tables and sequences. It receives no DDL privileges and no access to unrelated application tables except the minimum owner/profile lookup needed by the worker.
- Initialize one lazy module-level `psycopg_pool.ConnectionPool` per warm function instance with `min_size=0`, a small bounded `max_size`, connection timeout, and statement timeout. Do not open database connections at import/build time.
- Keep every database interaction in `src/sermon_evaluator/persistence.py`; evaluator, Gemini, and report modules must not contain SQL.
- Prisma owns `schema.prisma`, migrations, constraints, indexes, and environment provisioning. Python contains no migration framework.
- Add integration tests that apply the Prisma migration to local PostgreSQL and then exercise the Python persistence adapter against the resulting schema.

## Prisma data model

- Add these owner-scoped models:
  - `sermonPreacher`: owner, display name, normalized name, timestamps; unique on owner plus normalized name.
  - `sermonAudioFingerprint`: owner, SHA-256, verification state, lifetime run-credit limit fixed at nine, reserved credits, consumed credits, first-seen timestamp, and last-seen timestamp; unique on owner plus SHA-256. Retain verified fingerprints as minimal quota tombstones after audio or evaluation deletion; failed provisional fingerprints may be removed.
  - `sermonUploadReservation`: owner, claimed SHA-256, filename, MIME type, byte size, Appwrite bucket/file IDs, state, expiry, reattach target when applicable, and timestamps. Reservations are single-use and owner-scoped.
  - `sermonAudioAsset`: fingerprint, nullable Appwrite bucket/file IDs after deletion, original filename, MIME type, byte size, duration seconds, reference count, deletion timestamps, and upload verification state; unique on fingerprint after verification.
  - `sermonEvaluation`: owner, preacher, audio fingerprint, optional retained audio asset, title, required `preachedOn DateTime @db.Date`, preset, requested/completed runs, status, stage version, attempt deadline, cancel request, duration-policy fields, aggregate scores, provenance JSON, error code/message, and timestamps. A newly uploaded evaluation may reference a provisional fingerprint until the worker verifies the bytes.
  - `sermonScoringRun`: evaluation, ordinal, terminal status, final seed, raw structured score, confidence, and timestamps; unique on evaluation plus ordinal.
  - `sermonScoringAttempt`: evaluation, scoring run, attempt number, seed, provider response metadata, structured result, error code/message, timing, and status; unique on scoring run plus attempt number and unique on evaluation plus seed.
  - `sermonEvaluationAttempt`: evaluation, attempt number, start/deadline/end timestamps, Appwrite execution ID, resume reason, and terminal outcome.
  - `sermonRunCreditReservation`: fingerprint, evaluation, requested credits, preset, state, actor, reservation/consumption timestamps, and release reason; unique on evaluation.
  - `sermonAdminAuditEvent`: authenticated Appwrite actor ID, optional evaluation and owner IDs, action, requested run count, reason code, metadata JSON, and created timestamp. Treat it as append-only application audit data.
  - `sermonWorkerLease`: fixed slot ID, lease owner, evaluation/attempt IDs, lease expiry, heartbeat, and timestamps.
  - `sermonReportArtifact`: evaluation, format, content, checksum, report version, and creation time; unique on evaluation plus format plus report version.
- Add indexes for owner/status, owner/preached date, owner/fingerprint, fingerprint/evaluation creation time, preacher/preached date, evaluation/run status, admin actor/action/time, queued creation time, lease expiry, and analytics filters.
- Add the active-owner partial unique index through explicit SQL in the Prisma migration because Prisma schema syntax cannot express a partial index. Keep evaluation-plus-seed uniqueness as a normal compound unique constraint on `sermonScoringAttempt`.
- Enforce both the existing global daily quota and the new lifetime per-sermon budget:
  - Regular users may reserve at most six requested scoring runs per UTC day across sermons. Explicit, audited admin exemptions may bypass this daily anti-abuse quota.
  - Every owner-plus-verified-SHA-256 fingerprint has a hard lifetime limit of nine scoring-run credits in the product, with no admin bypass in v1.
  - The original evaluation counts. Standard reserves one credit and can therefore be selected at most nine times if used exclusively; High confidence reserves three and can therefore be selected at most three times if used exclusively. Mixed use is allowed while sufficient credits remain.
  - Create the evaluation and its credit reservation in one transaction. Atomically reject the transaction unless `consumedCredits + reservedCredits + requestedRuns <= 9` and the applicable daily quota also has capacity.
  - After the worker verifies the actual audio hash, move the reservation from reserved to consumed immediately before the first Step 2 scoring wave. Provider retries, a resumed job attempt, and aggregate-feedback retries never add credits.
  - Release a reservation when upload verification fails or an evaluation is canceled before Step 2 begins. Once Step 2 begins, cancellation, failure, timeout, report deletion, audio deletion, or evaluation deletion does not refund the consumed credits.

## Optional duration adjustment

- Refactor aggregation to retain:
  - `overallImpactBase`: weighted result before duration logic
  - `calculatedDurationPenalty`: the existing deterministic penalty, including zero
  - `overallImpactAdjusted`: base minus the calculated penalty, clamped exactly like the source
- Store `durationAdjustmentEnabled`, defaulting to `false`. The displayed/exported `overallImpact` equals the adjusted value only when this setting is enabled.
- Place the control in an expandable “Advanced options” section:
  - Switch label: “Apply sermon-length adjustment.”
  - Default: off.
  - Explanation: “Optionally reduces Overall Impact for sermons shorter than 35 minutes or longer than 50 minutes. Rubric and category scores are unaffected.”
  - When enabled, show the thresholds before submission and the calculated effect after duration is known.
- Allow the owner to turn the adjustment on or off later from the detail page. This updates the displayed score and regenerates versioned reports without rerunning Gemini or mutating raw scoring runs.
- Store `durationPolicyUpdatedAt` and the authenticated actor in the audit record.
- Dashboard preacher trends and default Overall Impact comparisons use `overallImpactBase`. “Duration-adjusted Overall Impact” is an optional metric selection.

## Appwrite Storage, upload, verification, playback, and deletion

- Create separate development and production `sermon-audio` buckets:
  - File Security enabled.
  - Create permission granted to either the `sermon-evaluator-beta` or `sermon-evaluator-admin` label, because the admin label implies feature access.
  - Owner-only file read, update, and delete permissions.
  - Allowed extensions and validated MIME types: MP3, M4A, and WAV.
  - Maximum file size: 100 MiB (`104,857,600` bytes).
  - Maximum decoded duration: three hours.
  - Compression and image transformation disabled.
- Upload flow:
  1. The browser validates extension, declared MIME type, and the 100 MiB limit, then hashes `File.stream()` incrementally in a Web Worker without loading the complete audio file into JavaScript memory.
  2. `POST /api/v1/sermon-evaluations/uploads/prepare` authenticates through the Appwrite session cookie, requires either sermon-evaluator label, and accepts the claimed SHA-256, byte size, filename, MIME type, and requested preset.
  3. The prepare endpoint performs an owner-scoped lookup by SHA-256 before creating any Appwrite upload authorization. Its response is a discriminated union:
     - `existing_evaluation`: return the latest evaluation ID, canonical detail URL, remaining lifetime run credits, retained-audio state, and evaluation-history summary. The client uses `router.replace()` to load that page and does not upload.
     - `reattach_required`: the fingerprint and prior evaluation exist but the owner deleted the retained audio. Route to the prior detail page and offer an explicit reattach action tied to the existing fingerprint and remaining credits; do not create a new sermon identity or reset its budget.
     - `upload_required`: no verified fingerprint exists for this owner and hash. After confirming the selected preset fits the applicable daily quota, create a short-lived owner-scoped upload reservation and mint a short-lived Appwrite JWT from the existing session.
  4. For `upload_required`, the browser uploads directly with the Appwrite Web SDK and owner-only file permissions. The SDK handles files over 5 MB in chunks and reports progress. [Appwrite large-file uploads](https://appwrite.io/docs/products/storage/upload-download)
  5. `POST /api/v1/sermon-evaluations/uploads/finalize` verifies reservation ownership, expiry, Appwrite file metadata, size, permissions, and claimed SHA-256. It repeats the owner-plus-hash lookup inside the transaction so two simultaneous tabs cannot create two canonical assets; if another request won the race, delete the redundant Appwrite file and return `existing_evaluation`.
  6. Before any Gemini call, the Appwrite worker streams the file to temporary storage, recomputes SHA-256 while writing, and validates the actual container/MIME type. The client hash is an upload-avoidance hint, never the final security authority.
  7. If the verified hash differs from the claim, check the verified owner-plus-hash identity atomically. When it is already known, release the provisional reservation, delete the redundant Appwrite file, and return the canonical evaluation pointer without scoring. Otherwise reject the mismatched upload and require the client to restart with the verified hash; never let a falsified client hash bypass the nine-credit budget.
- Deduplicate identical bytes within the same owner account regardless of filename. Changed metadata or encoding creates a new hash. Keep cross-user deduplication out of v1.
- Expire unused upload reservations and have the scheduled recovery task delete abandoned Appwrite files that were never finalized or attached to an evaluation. Cleanup never deletes a canonical retained asset or its fingerprint tombstone.
- Retain audio privately until the owner deletes it. Delete an Appwrite file only after its final evaluation reference disappears. Support “delete audio but keep report,” but retain the owner-scoped verified fingerprint and credit counters as a minimal quota tombstone so deletion cannot reset the nine-credit limit.
- For playback, `POST /api/v1/sermon-evaluations/{id}/audio/playback-token` authenticates ownership and creates a five-minute Appwrite file token through `node-appwrite`; the browser plays the tokenized Appwrite URL directly, so audio bytes do not proxy through Vercel. [Appwrite file tokens](https://appwrite.io/docs/products/storage/file-tokens)
- Never expose the Appwrite API key, Function API key, Neon URL, Gemini key, or another owner’s file ID to the browser.

## Authenticated API surface and contracts

- Add strict Zod contracts under `lib/api/contracts/sermon-evaluations.ts`, but keep the label-gated private-beta routes and schemas out of the public `lib/api/spec.ts` registry and generated `docs/api/openapi.json` document.
- Implement:
  - `POST /api/v1/sermon-evaluations/uploads/prepare`
  - `POST /api/v1/sermon-evaluations/uploads/finalize`
  - `POST /api/v1/sermon-evaluations`
  - `GET /api/v1/sermon-evaluations`
  - `GET /api/v1/sermon-evaluations/capabilities`
  - `GET /api/v1/sermon-evaluations/{id}`
  - `GET /api/v1/sermon-evaluations/{id}/status`
  - `GET /api/v1/sermon-evaluations/analytics`
  - `POST /api/v1/sermon-evaluations/{id}/cancel`
  - `POST /api/v1/sermon-evaluations/{id}/retry`
  - `POST /api/v1/sermon-evaluations/{id}/reevaluate`
  - `PATCH /api/v1/sermon-evaluations/{id}/duration-policy`
  - `POST /api/v1/sermon-evaluations/{id}/audio/playback-token`
  - `DELETE /api/v1/sermon-evaluations/{id}/audio`
  - `DELETE /api/v1/sermon-evaluations/{id}`
  - `GET /api/v1/sermon-evaluations/{id}/exports/{format}`
- Every route uses `requireAuthenticatedUser()` plus the feature-local label gate and derives the owner from the authenticated Appwrite session. Requests never accept `userId`, `ownerId`, an Appwrite execution ID, worker status fields, or an authoritative client-supplied admin flag.
- `GET /capabilities` returns only server-derived sermon access and admin capabilities. A custom `requestedRuns` value from one through nine is valid only when the same request’s authenticated Appwrite user currently has `sermon-evaluator-admin`; otherwise the API accepts only the Standard or High-confidence preset contract.
- Define `uploads/prepare` as the authoritative pre-upload decision endpoint. The client supplies a hash and metadata, but the server scopes lookup results to the authenticated owner and returns only `existing_evaluation`, `reattach_required`, or `upload_required`; it never reveals whether another owner has the same bytes.
- Evaluation creation stores the job transactionally before invoking Appwrite. If async invocation fails, leave the durable job `QUEUED`; the scheduled recovery invocation will find it.
- `POST /{id}/retry` is available only for retryable failed or timed-out work and adds an attempt to the same evaluation without charging more lifetime credits. `POST /{id}/reevaluate` is available from a completed evaluation, accepts Standard or High confidence, reuses the canonical retained audio, creates a new evaluation and credit reservation, and rejects requests whose cost exceeds the fingerprint’s remaining credits.
- Detail and status responses include stable stage names, requested/completed run counts, retry-wave information, timestamps, warning/error codes, cancellation state, fingerprint-level evaluation history, and `runCreditsLimit`, `runCreditsConsumed`, `runCreditsReserved`, and `runCreditsRemaining` without exposing hashes, provider prompts, secrets, or internal stack traces.

## Product experience

- Add a protected `/sermon-evaluation` route under Labs using the existing Calvinist Parrot design system.
- Resolve `/capabilities` before rendering privileged controls. Users with neither label receive the protected-feature access-denied state; admins see the custom selector only when the server returns `canChooseCustomRunCount: true`.
- Evaluation form:
  - Required audio, sermon title, preacher, and preached date.
  - Standard or High-confidence preset for regular users.
  - Admin-only one-through-nine run selector with explicit cost, limited by the same fingerprint’s remaining lifetime credits even when the admin is exempt from the daily quota.
  - Advanced-options disclosure containing the off-by-default duration adjustment.
  - Client validation for file type and the 100 MiB limit, followed by a visible “Checking for an existing evaluation” hashing state before any upload begins.
  - When the pre-upload lookup finds the same owner/file hash, replace the form route with the latest evaluation detail page and show “You already evaluated this audio” plus its history and remaining run credits. Do not show an upload confirmation or create another Appwrite file.
  - Hashing, duplicate redirect, upload, reattach, queue, stage, parallel-run, cancellation, warning, timeout, and completion states.
- Dashboard:
  - Sermon, preacher, latest-score, and trend KPIs.
  - Preacher/date/metric/status/duration-policy filters.
  - Base Overall Impact time series grouped by preacher and anchored to preached date.
  - Optional adjusted-overall series.
  - Filterable aggregate table with duration-adjustment indicator.
  - Metric heatmap, duration-versus-impact scatterplot, preacher trailing-average comparison, and High-confidence uncertainty ranges.
- Detail page:
  - Private tokenized Appwrite audio playback and provenance.
  - Base Overall Impact prominently displayed.
  - Adjusted score and penalty only when relevant, with an editable duration-policy control.
  - Six aggregates, seven rubric sections, 28 subcriteria, Step 1 structure, coaching feedback, requested/completed run counts, warnings, versioned report downloads, and a chronological evaluation history for the same audio fingerprint.
  - A run-credit meter such as “3 of 9 sermon run credits used,” with copy clarifying that Standard costs one and High confidence costs three. Avoid calling these LLM “tokens” in the UI.
  - A “Re-evaluate” action that reuses the retained Appwrite audio, displays Standard and High-confidence costs before confirmation, disables any option that exceeds the remaining balance, and never asks for the file again.
  - If the owner previously deleted the audio, replace “Re-evaluate” with “Reattach audio to re-evaluate.” Re-hash the selected file, require it to match the existing fingerprint, preserve the prior history and consumed-credit count, and then enable reevaluation.
  - Retry failed attempt, cancel active evaluation, delete-audio, and delete-evaluation actions. Deletion copy must state that consumed sermon run credits are not restored.
- Keep evaluations private and describe them as coaching feedback rather than public preacher rankings.

## Validation and parity gates

- Freeze `SOURCE_PROVENANCE.json`, copied prompts, schemas, weights, calibration logic, and source fixtures before adapting provider or persistence boundaries.
- Port all 62 calibration test cases with their assertions unchanged; only import paths and fixture locations may change.
- Add deterministic fixture tests proving that source and target aggregation, strict calibration, ceiling compression, confidence weighting, duration penalty, and report field mapping match exactly.
- Add CLI contract tests covering every preserved flag, historic filename, append behavior, one-run mode, three-run mode, and explicit legacy duration-adjustment parity.
- Add fake-provider concurrency tests that use a synchronization barrier to prove three and nine requested scoring runs overlap in time and are not invoked sequentially.
- Add retry tests proving:
  - Primary seeds retain their historic ordinal mapping.
  - Failed slots retry in parallel waves.
  - Replacement seeds are deterministic and never reused.
  - Nine initial runs can still receive replacements.
  - Partial success becomes `COMPLETE_WITH_WARNINGS`.
- Add fake-clock deadline tests proving no provider call starts after the soft budget, timeout state is persisted before 900 seconds, worker leases are released, and recovery cannot extend the original attempt deadline.
- Add database integration tests for compare-and-set transitions, duplicate executions, lease expiry, one-active-evaluation enforcement, daily quota reservation, atomic nine-credit lifetime enforcement, mixed Standard/High-confidence spending, same-evaluation retry without an extra charge, nonrefundable consumed credits after deletion, cancellation races, report publication, and Python SQL compatibility with the Prisma migration.
- Add upload-contract tests proving that hashing precedes `uploads/prepare`, an owner-scoped duplicate returns `existing_evaluation` without minting a JWT or calling Appwrite upload APIs, two simultaneous tabs converge on one canonical asset, reattachment preserves history and credits, and a falsified client hash cannot bypass deduplication or the credit limit.
- Add authorization tests proving beta-label access, admin-label implied access, unlabeled denial, server rejection of spoofed admin fields, custom-run denial after label revocation, daily-quota exemption audit, and the rule that `ADMIN_ID` alone does not grant sermon-admin access. Retain regression coverage showing existing `lib/admin.ts` behavior is unchanged for Church Finder.
- Add Appwrite development-project tests for JWT upload, unlabeled denial, upload permission through either sermon label, owner-only permissions, 100 MiB boundary behavior, chunked upload, finalize-time metadata verification, file tokens, final-reference deletion, retained fingerprint tombstones, and cross-user isolation.
- Compare the original CLI and canonical local runner on the same private audio with `gemini-3.6-flash`:
  - Prompt hashes, schemas, initial seeds, run count, deterministic post-processing, and report sections must match.
  - Live Gemini scores are not required to be byte-identical; parity requires schema completeness, successful stage execution, preserved methodology, and exact deterministic calculations from captured raw outputs.
- Run repository validation appropriate to the changed files: Python tests, `npx prisma validate`, migration application against local PostgreSQL, `npm run openapi:generate`, `npm run check`, `npm test`, `npm run build`, `docker compose config`, and `git diff --check`.

## Rollout and retirement

- Implement in this order:
  1. Platform-neutral evaluator copy, provenance, dependency manifests, and local CLI.
  2. Source-parity and deterministic tests.
  3. Prisma models, migration, Python pooled persistence, state machine, leases, and deadline handling.
  4. Development Appwrite bucket, Function, JWT upload, scheduled recovery, and file-token playback.
  5. Authenticated contracts and Next.js APIs.
  6. Detail experience.
  7. Dashboard and analytics.
  8. Beta production deployment.
- Require one successful Standard and one successful High-confidence production evaluation, both under 15 minutes, before declaring Calvinist Parrot canonical.
- Confirm a nine-run admin evaluation executes scoring calls concurrently and remains under the same 15-minute attempt budget before enabling the admin selector in production.
- Provision test beta and admin users independently in both Appwrite projects through the Console, confirm adding/removing `sermon-evaluator-admin` changes only sermon capabilities after session refresh, and verify the existing `ADMIN_ID` user retains all prior non-sermon behavior whether or not that user receives the new label.
- Before beta, confirm that selecting an already-evaluated file redirects before upload, reevaluation reuses the retained Appwrite file, nine Standard evaluations or three High-confidence evaluations exhaust the same nine-credit fingerprint budget, mixed presets deduct correctly, and deletion/re-upload cannot reset the balance.
- After parity, open the CP-Evals-Lab issue “Retire sermon evaluator now maintained in Calvinist Parrot,” containing:
  - Canonical package link and production-validation evidence.
  - Copied source commit and adaptation summary.
  - Checklist to remove the old CLI, sermon package, sermon-only schemas/prompts/framework/tests, and documentation/dependency references.
  - Warning to retain code still used by other evaluators.
  - Acceptance criterion that the remaining CP-Evals suite passes under `workon cp_evals`.
- Perform CP-Evals deletion through a separate issue-linked PR; do not remove the old implementation before production verification.

## V1 exclusions

- Legacy-result import.
- Public sharing or preacher rankings.
- In-product sermon-admin creation, role editing, or label management.
- Cross-user audio deduplication.
- Acoustic or perceptual duplicate detection; v1 identity is exact SHA-256 bytes only.
- Transcript editing.
- Sequential multi-run evaluation.
- Model selection in production.
- Moving the devotional cron from Vercel.
- Proxying audio upload or playback bytes through Vercel.
