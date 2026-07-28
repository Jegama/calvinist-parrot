### How to provision Appwrite

Until local mode is implemented, this is the current cloud setup.

#### 1. Use the Appwrite project that owns the account

For development, use the same Appwrite project referenced by your local `NEXT_PUBLIC_APPWRITE_PROJECT_ID`. The upload authorization creates a JWT from that authenticated project and returns the same project/bucket to the browser. [Source: [appwrite.ts:57](/Users/omni_jgmancilla/Dev/calvinist-parrot/lib/sermon-evaluation/appwrite.ts:57), “upload JWT is derived from the authenticated Appwrite session”]

In that development project:

- Open Auth → Users → `test@test.com`.
- Add `sermon-evaluator-admin`, preserving any existing labels.
- Sign out and back in.

Appwrite labels grant resource access and are attached directly to users; no separate label resource or label ID is required. [Appwrite Docs, [Labels](https://appwrite.io/docs/products/auth/labels), “labels categorize users and can grant resource access”]

#### 2. Create the private audio bucket

Create a bucket such as `sermon-audio-dev` with:

- File Security enabled.
- Maximum file size: `62,914,560` bytes.
- Extensions: `mp3`, `m4a`, `wav`.
- Create permission for both sermon labels.
- No public read permission.

The client sets owner-only permissions on each uploaded file, and those file permissions only take effect when File Security is enabled. [Source: [types.ts:7](/Users/omni_jgmancilla/Dev/calvinist-parrot/lib/sermon-evaluation/types.ts:7), “60 MiB upload limit”] [Source: [upload.ts:26](/Users/omni_jgmancilla/Dev/calvinist-parrot/components/sermon-evaluation/upload.ts:26), “uploaded files receive owner permissions”] [Appwrite Docs, [Storage permissions](https://appwrite.io/docs/products/storage/permissions), “file-level permissions require File Security”]

#### 3. Connect the Function to GitHub

Recommended route:

- Appwrite Console → Functions → Create Function → connect Git provider.
- Select this repository.
- Runtime: Python 3.12.
- Root directory: `services/sermon-evaluator`.
- Entrypoint: `entrypoints/appwrite.py`.
- Build command:  
  `pip install --no-cache-dir -r requirements.txt && pip install --no-deps .`
- Timeout: `900`.
- Schedule: `* * * * *`.
- Public execute access: empty.
- Dynamic-key scopes: `files.read`, `files.write`.
- Add a path trigger for `services/sermon-evaluator/**`.

Appwrite supports Git-connected Functions, branch/path filters, and a 900-second maximum timeout. Python 3.12 is currently supported on Appwrite Cloud. [Appwrite Docs, [Deploy from Git](https://appwrite.io/docs/products/functions/deploy-from-git), “Git-connected Functions can use branch and path build triggers”] [Appwrite Docs, [Functions](https://appwrite.io/docs/products/functions/functions), “Function timeout maximum is 900 seconds”] [Appwrite Docs, [Runtimes](https://appwrite.io/docs/products/functions/runtimes), “Python 3.12 is an available runtime”]

There is another deployment gap here: current Appwrite CLI documentation uses `appwrite.config.json`, while this branch provides `appwrite.json` with an empty project ID and no bucket definition. Therefore the branch is not currently a complete infrastructure-as-code deployment. [Source: [appwrite.json:2](/Users/omni_jgmancilla/Dev/calvinist-parrot/appwrite.json:2), “project ID is empty and only the Function is defined”] [Appwrite Docs, [CLI installation and initialization](https://appwrite.io/docs/tooling/command-line/installation), “appwrite init project creates appwrite.config.json”]

#### 4. Configure Function variables in Appwrite

Set these under Function → Settings → Environment variables:

```text
SERMON_DATABASE_URL=<development Neon URL, dedicated worker role>
GEMINI_API_KEY=<worker Gemini key>
SERMON_AUDIO_BUCKET_ID=<the bucket ID above>
SERMON_GEMINI_MODEL=gemini-3.6-flash
SERMON_SOFT_DEADLINE_SECONDS=840
SERMON_MAX_PARALLEL_SCORING_RUNS=9
```

Appwrite injects `APPWRITE_FUNCTION_API_ENDPOINT`, `APPWRITE_FUNCTION_PROJECT_ID`, and the dynamic API key; do not configure those yourself. Variable changes require redeploying the Function. [Appwrite Docs, [Function environment variables](https://appwrite.io/docs/products/functions/environment-variables), “Appwrite injects Function variables and custom variable changes require redeployment”]

`SERMON_MAX_ACTIVE_EVALUATIONS=2` is documented but currently unused—the database migration hard-codes exactly two worker slots. That variable should either be implemented or removed. [Source: [migration.sql:504](/Users/omni_jgmancilla/Dev/calvinist-parrot/prisma/migrations/20260728022129_sermon_evaluation/migration.sql:504), “worker slot constraint is fixed to slots 1 and 2”]

### What belongs in Vercel

Yes, Vercel needs environment variables because Next.js is the control plane. Vercel will not deploy or configure the Appwrite Function; Appwrite’s Git integration or CLI does that independently.

| Vercel / local Next.js | Appwrite Function |
|---|---|
| `DATABASE_URL` | `SERMON_DATABASE_URL` |
| `APPWRITE_ENDPOINT` | `GEMINI_API_KEY` |
| `APPWRITE_PROJECT_ID` | `SERMON_AUDIO_BUCKET_ID` |
| `APPWRITE_API_KEY` | `SERMON_GEMINI_MODEL` |
| `APPWRITE_SERMON_FUNCTION_ID` | `SERMON_SOFT_DEADLINE_SECONDS` |
| `APPWRITE_SERMON_BUCKET_ID` | `SERMON_MAX_PARALLEL_SCORING_RUNS` |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT` | Appwrite-injected Function variables |
| `NEXT_PUBLIC_APPWRITE_PROJECT_ID` |  |

Use development Appwrite resources for Vercel Preview/Development and production resources only for Vercel Production. Environment-variable changes apply only to subsequent deployments, so redeploy after adding them. [Vercel Docs, [Environment variables](https://vercel.com/docs/environment-variables), “variables are scoped by environment and changes only affect new deployments”]

The Vercel `APPWRITE_API_KEY` must remain server-only and have only the capabilities used here: file metadata/deletion, file-token creation, and Function execution. The browser receives only the `NEXT_PUBLIC_*` identifiers and a short-lived user JWT. [Source: [appwrite.ts:20](/Users/omni_jgmancilla/Dev/calvinist-parrot/lib/sermon-evaluation/appwrite.ts:20), “server key performs storage, token, and Function operations”]
