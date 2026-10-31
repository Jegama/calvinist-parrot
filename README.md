<div align="center">
    <a href="https://www.calvinistparrotministries.org">
        <img src="./public/LogoForHeader.png" alt="Calvinist Parrot Ministries" height="140" />
    </a>
</div>

# Calvinist Parrot

An AI-powered theological assistant – merging centuries-old Reformed wisdom with modern machine intelligence.

[**Website**](https://www.calvinistparrot.com/)

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

### Chat model configuration

The conversational Parrot agent uses Claude Haiku 5.5 through LangChain's `ChatAnthropic`. Configure `ANTHROPIC_API_KEY`, `PARROT_AGENT_PROVIDER=anthropic`, and `PARROT_ANTHROPIC_MODEL=claude-haiku-5-5` in each environment. Existing deployments with `PARROT_AGENT_PROVIDER=gemini` or `openai` must change that setting to switch providers; restart or redeploy after updating it.

The provider can still be set to `gemini` with `PARROT_GEMINI_MODEL` (default `gemini-3.8-flash`) or `openai` with `PARROT_OPENAI_MODEL` (default `gpt-6-luna`, using Responses for reasoning with tools). This setting controls conversational responses only. Memory extraction uses `gpt-6-luna` with reasoning effort `none`. Journal guidance, kids discipleship, devotionals, conversation titles, church evaluations, and sermon evaluations default to `gemini-3.8-flash`; the sermon worker honors `SERMON_GEMINI_MODEL`, so update any deployment override as well. Retrieval embeddings have separate model selection.

Haiku requests use adaptive thinking with a 16,384-token output budget shared by thinking and answer text, and omit sampling parameters. The agent retains thinking and tool blocks within a request; persisted conversation history contains the visible answer text. See [LangChain's Anthropic integration](https://docs.langchain.com/oss/javascript/integrations/chat/anthropic) and [Anthropic's Haiku 5.5 migration guide](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide).

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
We welcome contributions! Please see our Contributing Guide for details.

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
