<div align="center">
    <a href="https://www.calvinistparrotministries.org">
        <img src="./public/LogoForHeader.png" alt="Calvinist Parrot Ministries" height="140" />
    </a>
</div>

# Calvinist Parrot

An AI-powered theological assistant – merging centuries-old Reformed wisdom with modern machine intelligence.

[**Website**](https://www.calvinistparrot.com/) · [Changelog](./CHANGELOG.md)

This work is part of the [Calvinist Parrot Ministries](https://www.calvinistparrotministries.org/), we exist to glorify God by creating and freely distributing AI tools that proclaim the Gospel, strengthen the Church, and equip believers across the globe.

## Overview

Calvinist Parrot delivers Biblical insights and deep theological responses by combining multiple AI agents and a built-in review process modeled after Reformed theology. Whether you're exploring doctrine, engaging in a dynamic chat, or seeking daily devotionals, the Parrot is here to guide you.

## What the Parrot Can Do

- **Real-Time Chat:** Engage in interactive sessions with streamed responses.
- **Theological Questions:** Explore Bible and theology questions through Parrot chat.
- **Multi-Perspective Insights:** Choose from Reformed Baptist, Presbyterian, Wesleyan, Lutheran, Anglican, Pentecostal/Charismatic, or Non-Denominational Evangelical modes.
- **Daily Devotionals:** Get devotionals generated from current news and Scripture.
- **Personal Journal:** Daily reflections with pastoral insight. Each entry receives AI-powered guidance grounded in Scripture, identifying heart issues, suggesting "put off/put on" patterns from Ephesians 4, and offering practical next steps. Journal insights can be promoted to Prayer Tracker requests or continued in deeper conversation.
- **Heritage Journal:** Building faith with your children. Track annual discipleship plans, monthly vision, and daily parenting moments (nurture and admonition) with AI-powered shepherding guidance to help you intentionally disciple your kids.
- **Prayer Tracker:** Organize your prayer life with rotating prayer assignments, personal and family prayer requests, and prayer journals—designed to help you pray consistently for your household and broader faith community.
- **Church Finder:** Discover biblically sound churches with AI-powered doctrinal evaluations. Each church is analyzed for adherence to essential Christian doctrines, historic Reformed confessions, and theological soundness to help you find a faithful congregation.
 - **AI Model Evaluation Dashboard:** See how different AI models perform on doctrinal fidelity, kindness and gentleness, and interfaith sensitivity using the built-in evaluation dashboard at `/llm-evaluation-dashboard`.

## Getting Started

### Prerequisites
- Node.js 24. The repo includes an `.nvmrc`.
- npm
- Git
- Docker, for the local Postgres database
- Python 3.14 and the `cp_evals` virtualenvwrapper environment described in [Local Development](./docs/technical/Local%20Development.md)

### Environment Setup

1. **Fork this repository**

- Click the "Fork" button in the top right
- Follow the prompts to create your fork

2. **Clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/calvinist-parrot.git
cd calvinist-parrot
```

3. **Install dependencies**

```bash
npm install
```

4. **Environment variables and local database**

* Copy `.env.template` to `.env`
* Keep the local `DATABASE_URL` pointed at Docker
* Fill in required credentials and API keys
  * `CCEL_URL` is separate from the app database and should point to a PGVector store that holds the `data_ccel_vector_store` table used for CCEL retrieval

5. **Start the local database and apply migrations**

```bash
npm run db:up
npm run db:deploy
npm run db:seed
```

The seed adds the app database profile and starter journal fixtures for `test@test.com`, plus starter Church Finder records.

6. **Run the development server**

```bash
npm run dev
```

`npm run dev` launches Next.js and its required local workers. You can also use `npm run dev:local` to start Docker, apply committed migrations, seed local fixtures, and enter that same application process in one command.

Codex-managed worktrees share the local Postgres container but receive separate development, shadow, and test databases automatically. Put worktree-only API keys and local/staging credentials in `.env.worktree.local`; `.worktreeinclude` copies that ignored file into each new managed worktree.

For the database workflow, CI/CD notes, and testing recommendations, see [Local Development](./docs/technical/Local%20Development.md).

### Admin analytics

Accounts with the Appwrite label `analyticsadmin` can open **Analytics dashboard** from their profile or read aggregate JSON at `/api/admin/analytics`. The dashboard offers 7 (default), 30, 90, 180, and 365 days, plus **All time**. Existing dashboard links and API requests with `?days=730` still return the two-year report. Fixed periods compare completed America/Chicago days with the preceding period of equal length. **All time** includes available history through the displayed snapshot time, including today. Each reporting window reuses its aggregate snapshot until the next Chicago midnight. **Refresh** obtains a fresh snapshot and expires cached snapshots for the other windows. Access is checked on every request.

Preview and Production use separate application databases. Each dashboard counts chat activity in its own database, including turns without usage receipts. Chat spend uses provider receipts from the current deployment environment and follows the Chicago date of the original submission. A visible reply completes that turn once. Fixed periods include later retries and background work for those submissions. All time includes replies recorded and attempts started before the report snapshot. Open **Chat cost details** for channel totals, retry spend, token counts and stage/model costs. Each channel shows spend per completed turn when collection covers its submissions, every completed turn has a successful model receipt, and every recorded attempt is measured and priced. Work with no matching submission is reported separately by attempt date. Estimates use standard published token prices.

Registration counts and username sign-in share the server-only `APPWRITE_ANALYTICS_READ_KEY`. Grant this key only `users.read` in the same Appwrite project that issues sessions. Production pageviews use `VERCEL_PROJECT_ID` and a server-only token (`VERCEL_ANALYTICS_TOKEN` or `VERCEL_TOKEN`). Set `VERCEL_TEAM_ID` to explicitly scope the request to a team. The dashboard labels unavailable sources and shows the remaining metrics. See the [environment template](./.env.template) for configuration.

Feature names in the usage table open the corresponding engagement details. Website rates match each step to an earlier step of the same conversation, journal entry, rotation, devotional view, directory visit, or sermon submission. Both steps must fall in the selected observation window, and each flow counts once per step. Personal Journal prayer saves and chat handoffs each use ready reflections as their denominator. Requests marked answered and external server outcomes have independent counts. Anonymous Vercel pageviews continue to measure reach.

Engaged devotional reading is an estimate of 30 seconds of visible-tab time. Hiding the page pauses the clock. Reloading the same reading within its short-lived view resumes the clock. Devotional and directory views use opaque IDs local to a browser history entry, reused on reload for up to 30 minutes. Existing first-party operation IDs match saved actions. Apply the engagement migrations with the release. The dashboard gives the collection dates and earlier periods retain their available independent counts. Older browser builds can miss newly instrumented UI steps. To retrieve a saved church through `GET /api/v1/churches/{id}`, supply a UUID `Idempotency-Key` and reuse it when retrying that lookup. The shared legacy church detail route has unknown origin. New sermon submissions use their server entry point, including submissions from older website tabs that still call the public API. Existing evaluations with unknown origin stay outside the website funnel. MCP reporting accepts the original tool operation when an adapter is available.

Church Finder and Sermon Evaluator report model spend, external-service fees, and cost per completed evaluation by entry channel for the current deployment environment. Period spend includes failed and retried calls. The completion average includes earlier attempts on evaluations that finished during the period and is available when their costs are fully covered. Saved church reads and resumed sermon stages that reuse saved results generate no new charges. The dedicated worker database role needs the grants in the [sermon worker setup](./services/sermon-evaluator/README.md).

Deleting an individual chat or journal entry leaves its content-free activity records in place. When fulfilling an account deletion request, include the account’s chat and action records and any engagement, journal completion, and provider records linked to its operations, entries, evaluations, or revisions. Delete chat provider receipts linked by operation ID to the account’s chat events before removing those events.

### Chat model configuration

The conversational Parrot agent uses Claude Haiku 5.5 through LangChain's `ChatAnthropic`. Configure `ANTHROPIC_API_KEY`, `PARROT_AGENT_PROVIDER=anthropic`, and `PARROT_ANTHROPIC_MODEL=claude-haiku-5-5` in each environment. Existing deployments with `PARROT_AGENT_PROVIDER=gemini` or `openai` must change that setting to switch providers; restart or redeploy after updating it.

When `PARROT_AGENT_PROVIDER=gemini`, chat uses `gemini-4-hydrogen` for streaming responses and tool calls. `PARROT_GEMINI_MODEL` overrides the model for that provider. Check both Preview and Production environment variables for older explicit aliases when deploying a new default. The OpenAI conversation provider uses `PARROT_OPENAI_MODEL` (default `gpt-6-luna`) with the Responses API.

Personal Journal and Heritage Journal use Claude Haiku 5.5 for all structured generation stages. The daily devotional and conversation titles use the shared Gemini default, Hydrogen. Church Finder uses Hydrogen for all six extraction calls and records the alias with the evaluation. The sermon worker uses Hydrogen for audio evidence, scoring, harmonization, and feedback, with its own `SERMON_GEMINI_MODEL` override in Appwrite. Memory extraction uses OpenAI's `gpt-6-luna` and CCEL retrieval uses `text-embedding-3-small` for embeddings. Historical model identifiers in saved reports, evaluations, and fixtures describe the model used when those outputs were created.

The default Haiku 5.5 configuration uses adaptive thinking with a 16,384-token output budget shared by thinking and answer text, and omits sampling parameters. Other `PARROT_ANTHROPIC_MODEL` overrides omit the thinking setting and use that model's API default; for example, Haiku 4.5 runs without extended thinking rather than receiving an unsupported adaptive setting. The agent retains thinking and tool blocks within a request; persisted conversation history contains the visible answer text. See [LangChain's Anthropic integration](https://docs.langchain.com/oss/javascript/integrations/chat/anthropic), [Anthropic's Haiku 5.5 migration guide](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide), and [legacy thinking compatibility](https://platform.claude.com/docs/en/build-with-claude/extended-thinking#migrating-to-adaptive-thinking).

## API Endpoints

The generated [OpenAPI 3.1 contract](https://www.calvinistparrot.com/api/v1/openapi.json) and [interactive API reference](https://www.calvinistparrot.com/api/v1/docs) are the source of truth for public request, response, and streaming event schemas.

### Core Features

- **/api/v1/chats**

  Resource-oriented LangGraph chat API for creating conversations, reading history, streaming new messages, and stopping in-progress requests.

Counsel of Three is retired as of October 31, 2026. `/api/v1/qa`, `/api/parrot-qa`, and `/api/elaborate` return HTTP `410 Gone` with migration guidance and never invoke a model. `/parrot-qa` directs visitors to Parrot chat. Existing saved answers remain in question history; no data migration or deletion is performed. The former fine-tuned-model setting `FT_MODEL` is no longer used.

The former `/api/parrot-chat` route remains a deprecated compatibility endpoint. Its responses and the retired `/api/parrot-qa` responses retain the RFC 9745 `Deprecation` header, migration-documentation `Link`, and privacy-safe `deprecated_api_request` runtime log. Migrate clients to `/api/v1/chats` using the [Parrot Chat API documentation](https://www.calvinistparrot.com/documentation-parrot-chat).

### Church Finder

- **/api/churches**  
  List and create churches with AI-powered doctrinal evaluation (GET/POST).

- **/api/churches/[id]**  
  Retrieve detailed church information including evaluation history.

- **/api/churches/check**  
  Verify if a church already exists in the database by website URL.

- **/api/churches/meta**  
  Get filter metadata (states, denominations, totals) for church discovery.

## Contributing

We welcome contributions! See the [Contributing Guide](./CONTRIBUTING.md) for setup, pull requests, and versioning.

## Acknowledgements
Huge thanks to [AO Lab](https://www.helloao.org/) for providing the Bible API with the Berean Standard Bible ([BSB](https://berean.bible/)) translation and Bible Commentaries.

If you want to learn the legal restrictions to sharing God's word, click [here](https://copy.church/initiatives/bibles/).

## Contact
For questions or support, please [reach out](mailto:contact@calvinistparrotministries.org).

# Soli Deo Gloria

**"For from Him and through Him and to Him are all things. To Him be the glory forever! Amen."**
- Romans 11:36

<div align="center">
  <a href="https://copy.church/explain/importance/">
    <img src="https://copy.church/badges/lcc_alt_pde.png" alt="Copy.church" height="100" />
  </a>
  <a href="https://sellingJesus.org/free">
    <img src="https://copy.church/badges/sj_standard_pd.png" alt="sellingJesus.org/free" height="100" />
  </a>
</div>
