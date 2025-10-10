# Calvinist Parrot – AI Agent Guide
## Architecture
- Next.js 15 App Router project with TypeScript; API logic lives under `app/api/**`, pages and layouts under `app/**`.
- Clients authenticate with Appwrite if possible and fall back to a `userId` cookie (`app/page.tsx`, `app/[chatId]/page.tsx`).
- Prisma talks to a Postgres database; schema and migrations are in `prisma/schema.prisma` and `prisma/migrations/**`.
- UI components follow the shadcn pattern stored in `components/ui/**` and consumed by page-level components.
- Markdown answers render through `components/MarkdownWithBibleVerses.tsx`, which injects live verse popovers via the Bible API.

## Chat & QA Pipelines
- `/api/parrot-chat` handles ongoing conversations: creates chat records, streams JSONL events, and appends messages (`app/api/parrot-chat/route.ts`).
- Streaming uses `lib/progressUtils.sendProgress` to emit `{type}` events (`progress`, `parrot`, `gotQuestions`, etc.); the chat UI expects those exact strings.
- Chat replies come from a LangGraph agent (`utils/langChainAgents/mainAgent.ts`) whose tools are registered in `utils/langChainAgents/tools/index.ts`.
- The supplemental article search tool wraps Tavily and whitelists monergism.com and gotquestions.org (`supplementalArticleSearchTool.ts`).
- Conversation naming and categorization reuse OpenAI mini models via `utils/generateConversationName.ts` and `lib/prompts.ts`.
- `/api/parrot-qa` runs the multi-agent "Counsel of Three" flow, Calvin review, and final synthesis before storing `questionHistory` entries.

## Data & Integrations
- `prisma/chatHistory` and `prisma/chatMessage` persist threaded chats; `questionHistory` captures QA results; `parrotDevotionals` stores generated devotionals.
- Bible references resolve against AO Lab endpoints using helpers in `utils/bibleUtils.ts` and `utils/bookMappings.ts`.
- Daily devotionals call Tavily news plus OpenAI JSON-schema completions (`utils/devotionalUtils.ts`) and gate cron access with `Authorization: Bearer ${CRON_SECRET}` (`app/api/cron/devotional/route.ts`).
- LangChain ChatOpenAI models default to `gpt-5`/`gpt-5-mini`; keep model names in sync with `package.json` expectations and `.env.template`.

## Environment & Secrets
- Required env vars live in `.env.template`: `OPENAI_API_KEY`, `GPT_MODEL`, `FT_MODEL`, `TAVILY_API_KEY`, `DATABASE_URL`, `CRON_SECRET`, and the Appwrite public keys.
- Prisma expects `DATABASE_URL` to point at a Postgres-compatible instance (Neon in production).
- Tavily-powered features crash if `TAVILY_API_KEY` is missing; guard tool invocations or short-circuit gracefully when absent.
- Cron endpoints must run behind the `CRON_SECRET`; local testing requires setting that header manually.

## Frontend Patterns
- Pages are client components when using hooks/side effects; keep server components free of browser-only APIs.
- Chat UI streams tokens by appending partial responses in state; match the `DataEvent` discriminated union to avoid breaking renders (`app/[chatId]/page.tsx`).
- `MarkdownWithBibleVerses` should wrap any LLM output to ensure verse detection stays consistent.
- Sidebar chat list pulls from `/api/user-chats`; push updates after streaming completes to refresh the UI.
- Styling leans on Tailwind classes and shared primitives from `components/ui/**`; reuse them instead of ad-hoc markup.

## Workflows & Quality
- Install deps with `npm install`; run dev server via `npm run dev`; build invokes `prisma generate && next build`.
- Run `npx prisma migrate dev` when schema changes and inspect data with `npx prisma studio`.
- Lint with `npm run lint`; commit only after addressing TypeScript errors (Next enforces `strict` mode via `tsconfig.json`).
- API routes rely on streaming backpressure; prefer `ReadableStream` and `sendProgress` helpers over manual `Response` writes.
- Log sensitive payloads sparingly—OpenAI requests often include Scripture and user data; redact before shipping diagnostics.
- When adding tools or prompts, centralize constants in `lib/prompts.ts` to keep denominational variants and schema definitions in sync.
