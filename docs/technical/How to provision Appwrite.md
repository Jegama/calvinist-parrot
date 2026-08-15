### How to provision Appwrite

Routine local sermon development does not require an Appwrite Storage bucket or Function. The root `npm run dev` process uses the Docker application database, ignored local audio storage, and the local Python worker as documented in [Local Development.md](./Local%20Development.md). Appwrite is still used for the application's existing sign-in flow; this document covers the additional resources required only when exercising or deploying the cloud sermon runtime.

#### 1. Use the Appwrite project that owns the account

For a cloud-runtime development or preview environment, use the same Appwrite project referenced by that environment's `NEXT_PUBLIC_APPWRITE_PROJECT_ID`. The upload authorization creates a JWT from the authenticated project and returns the same project and bucket to the browser. [Source: [appwrite.ts:57](/Users/omni_jgmancilla/Dev/calvinist-parrot/lib/sermon-evaluation/appwrite.ts:57), “upload JWT is derived from the authenticated Appwrite session”]

In that development project:

- Open Auth → Users → `test@test.com`.
- Add `sermon-evaluator-admin`, preserving any existing labels.
- Sign out and back in.

Appwrite labels grant resource access and are attached directly to users; no separate label resource or label ID is required. [Appwrite Docs, [Labels](https://appwrite.io/docs/products/auth/labels), “labels categorize users and can grant resource access”]

The label is not needed for routine localhost sermon testing when `SERMON_RUNTIME=local`: the development-only `SERMON_DEV_ADMIN_EMAIL` fallback grants the configured account access. Authentication still comes from the development Appwrite project because that is the shared authentication architecture of the application, not a sermon-worker dependency.

#### 2. Create the private audio bucket

Skip this step for the local runtime.

Create a bucket such as `sermon-audio-dev` with:

- File Security enabled.
- Maximum file size: `104,857,600` bytes.
- Extensions: `mp3`, `m4a`, `wav`.
- Create permission for both sermon labels.
- No public read permission.

The client sets owner-only permissions on each uploaded file, and those file permissions only take effect when File Security is enabled. [Source: [types.ts:7](/Users/omni_jgmancilla/Dev/calvinist-parrot/lib/sermon-evaluation/types.ts:7), “100 MiB upload limit”] [Source: [upload.ts:26](/Users/omni_jgmancilla/Dev/calvinist-parrot/components/sermon-evaluation/upload.ts:26), “uploaded files receive owner permissions”] [Appwrite Docs, [Storage permissions](https://appwrite.io/docs/products/storage/permissions), “file-level permissions require File Security”]

#### 3. Connect the Function to GitHub

Recommended route:

- Appwrite Console → Functions → Create Function → connect Git provider.
- Select this repository.
- Runtime: Python 3.14.
- Root directory: `services/sermon-evaluator`.
- Entrypoint: `entrypoints/appwrite.py`.
- Build command:  
  `pip install --no-cache-dir -r requirements.txt && pip install --no-deps .`
- Timeout: `900`.
- Schedule: `* * * * *`.
- Public execute access: empty.
- Dynamic-key scopes: `files.read`, `files.write`.
- Add a path trigger for `services/sermon-evaluator/**`.

Appwrite supports Git-connected Functions with branch and path filters, and its current runtime table lists Python 3.14 for Appwrite Cloud. [Appwrite Docs, [Deploy from Git](https://appwrite.io/docs/products/functions/deploy-from-git), “Git-connected Functions can use branch and path build triggers”] [Appwrite Docs, [Runtimes](https://appwrite.io/docs/products/functions/runtimes), “Python 3.14 is an available Cloud runtime”]

The repository's `appwrite.json` records the Function definition, but it deliberately leaves the project ID empty and does not define the bucket. Do not treat it as complete infrastructure provisioning. Current Appwrite CLI documentation uses `appwrite.config.json`; until the repository adopts that format, connect the Function through the Console and copy the settings from `appwrite.json`. [Source: [appwrite.json:2](/Users/omni_jgmancilla/Dev/calvinist-parrot/appwrite.json:2), “project ID is empty and only the Function is defined”] [Appwrite Docs, [Deploy manually](https://appwrite.io/docs/products/functions/deploy-manually), “CLI deployment configuration is stored in appwrite.config.json”]

#### 4. Configure Function variables in Appwrite

`services/sermon-evaluator/.env.template` is the authoritative Function-variable contract. Set those values under Function → Settings → Environment variables:

```text
SERMON_RUNTIME=appwrite
SERMON_DATABASE_URL=<development Neon URL, dedicated worker role>
GEMINI_API_KEY=<worker Gemini key>
SERMON_AUDIO_BUCKET_ID=<the bucket ID above>
SERMON_GEMINI_MODEL=gemini-3.6-flash
SERMON_SOFT_DEADLINE_SECONDS=840
SERMON_MAX_PARALLEL_SCORING_RUNS=9
```

Appwrite injects `APPWRITE_FUNCTION_API_ENDPOINT`, `APPWRITE_FUNCTION_PROJECT_ID`, and the dynamic API key; do not configure those yourself. Variable changes require redeploying the Function. [Appwrite Docs, [Function environment variables](https://appwrite.io/docs/products/functions/environment-variables), “Appwrite injects Function variables and custom variable changes require redeployment”]

Worker capacity is database-owned and currently fixed at two lease slots by the migration; there is no corresponding environment variable. [Source: [migration.sql:504](/Users/omni_jgmancilla/Dev/calvinist-parrot/prisma/migrations/20260728022129_sermon_evaluation/migration.sql:504), “worker slot constraint is fixed to slots 1 and 2”]

### What belongs in Vercel

Vercel needs only the variables consumed by Next.js because it deploys the control plane. It will not deploy or configure the Appwrite Function; Appwrite's Git integration does that independently.

| Runtime owner | Source of truth | Sermon-related configuration |
|---|---|---|
| Vercel / Next.js control plane | Root `.env.template` | `SERMON_RUNTIME=appwrite`, `APPWRITE_SERMON_FUNCTION_ID`, `APPWRITE_SERMON_BUCKET_ID`, plus the root application's existing `DATABASE_URL` and Appwrite server/client variables |
| Appwrite Python Function | `services/sermon-evaluator/.env.template` | `SERMON_RUNTIME=appwrite`, `SERMON_DATABASE_URL`, `SERMON_AUDIO_BUCKET_ID`, `GEMINI_API_KEY`, model and execution-limit variables, plus Appwrite-injected Function variables |

Use development Appwrite resources for Vercel Preview/Development and production resources only for Vercel Production. Environment-variable changes apply only to subsequent deployments, so redeploy after adding them. [Vercel Docs, [Environment variables](https://vercel.com/docs/environment-variables), “variables are scoped by environment and changes only affect new deployments”]

For localhost, copy the root `.env.template`: it defaults `SERMON_RUNTIME=local` and does not require the Vercel sermon Function or bucket variables to be populated. The local sermon worker requires the root `GEMINI_API_KEY`; that value does not configure the deployed Function, which must receive its own worker credential in Appwrite.

The Vercel `APPWRITE_API_KEY` must remain server-only and have only the capabilities used here: file metadata/deletion, file-token creation, and Function execution. The browser receives only the `NEXT_PUBLIC_*` identifiers and a short-lived user JWT. [Source: [appwrite.ts:20](/Users/omni_jgmancilla/Dev/calvinist-parrot/lib/sermon-evaluation/appwrite.ts:20), “server key performs storage, token, and Function operations”]
