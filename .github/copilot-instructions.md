# Calvinist Parrot – AI Agent Guide
## Overview & Entry Points
- Next.js 16 App Router with TypeScript and Turbopack; route handlers under `app/api/**`, router pages/layouts under `app/**`.
- Global providers live in `components/providers/app-providers.tsx`, wrapping `AuthProvider`, `ReactQueryProvider`, and the theme provider for every page.
- Auth flows lean on Appwrite via `hooks/use-auth.tsx`; anonymous continuity now comes from `hooks/use-user-identifier.ts`, consumed in `app/page.tsx` and `app/[chatId]/page.tsx`.
- Prisma Postgres schema lives in `prisma/schema.prisma`; run `npx prisma migrate dev` after edits to keep migrations in sync.
- Shared UI primitives follow the shadcn pattern in `components/ui/**`; compose them inside page-level components and feature modules.

## State & Caching
- TanStack Query v5 is configured globally in `ReactQueryProvider` with a five-minute stale window; use standard `@tanstack/react-query` imports throughout the app.
- Sidebar chat data is sourced from `hooks/use-chat-list.ts`; reuse its query key helpers (`["chat-list", userId]`), mutation hooks, and cache update helpers when adding chat actions.
- Profile UI state is centralized in the Zustand store `app/profile/ui-store.ts`; extend it instead of scattering `useState` when touching profile dialogs or alerts.

## Conversational Pipelines
- `/api/parrot-chat` streams JSONL events via `lib/progressUtils.sendProgress`; the chat UI keys on `{type}` values (`progress`, `parrot`, `gotQuestions`, etc.).
- `utils/langChainAgents/mainAgent.ts` defines the LangGraph agent; new tools register in `utils/langChainAgents/tools/index.ts` and follow the Tavily whitelist in `supplementalArticleSearchTool.ts`.
- `/api/parrot-qa` orchestrates the "Counsel of Three" workflow, Calvin review, and stores results in Prisma `questionHistory`.
- Conversation titles and categories reuse mini OpenAI models through `utils/generateConversationName.ts` and prompt constants in `lib/prompts.ts`.
- `app/page.tsx` and `app/[chatId]/page.tsx` invalidate the chat list query after streaming completes; make sure new mutations call `invalidate`/`upsertChat` so the sidebar stays in sync.

## Feature Modules
- **Prayer Tracker:** Located in [app/prayer-tracker](../app/prayer-tracker). APIs mirror the UI in [app/api](../app/api). Key invariants:
  - **Unified Request System:** Use `UnifiedRequest` with `familyId` discriminant; household requests use `null`.
  - **Auth:** Use shared helpers in [lib/auth.ts](../lib/auth.ts) for all `app/api/**` handlers.
  - **Rotation Confirm Effects:** Writes to `prayerRotation`, `prayerLog`, and updates request statuses.
  - **Client Patterns:** Follow [app/prayer-tracker/api.ts](../app/prayer-tracker/api.ts) for optimistic updates and `Result<T, E>` errors; reuse TanStack Query cache keys and helpers.
- **Church Finder:** UI in [app/church-finder](../app/church-finder); APIs under [app/api/churches](../app/api/churches). Key invariants:
  - **Evaluation Pipeline:** See [utils/churchEvaluation.ts](../utils/churchEvaluation.ts) (Tavily crawl → concurrent LLM extraction → post-processing).
  - **Normalization:** Map Prisma relations via [lib/churchMapper.ts](../lib/churchMapper.ts); core doctrines stored as normalized columns; secondary/tertiary in JSON.
  - **Sorting & Badges:** List ordering via `sortChurchesByPriority` in [app/api/churches/route.ts](../app/api/churches/route.ts); enforce badge allowlist in [utils/badges.ts](../utils/badges.ts).
  - **Env Vars:** Requires `TAVILY_API_KEY` and `GEMINI_API_KEY`. See [.env.template](../.env.template).
 - **Journal:** UI in [app/journal](../app/journal); APIs under [app/api/journal](../app/api/journal). Key invariants:
   - **Auth & Ownership:** Use [lib/auth.ts](../lib/auth.ts) and verify `authorProfileId` before reads/writes.
   - **Streaming Events:** [entries/route.ts](../app/api/journal/entries/route.ts) streams NDJSON with event types: `entry_created`, `progress`, `call1a_complete`, `call1b_complete`, `call1c_complete`, `call2_complete`, `done`, `error`.
   - **AI Pipeline:** See [utils/journal/llm.ts](../utils/journal/llm.ts); outputs defined in [types/journal.ts](../types/journal.ts). Persist with retry/backoff and merge tags.
   - **Profile Counters:** Increment/decrement `journalEntriesCount` on create/delete.

## Data & Integrations
- Chat history tables: `prisma/chatHistory`, `prisma/chatMessage`; QA uses `questionHistory`; devotionals persist in `parrotDevotionals`; prayer tracker tables defined in latest migrations (`20250103*`, `20251011*`); church finder tables: `church`, `churchAddress`, `churchServiceTime`, `churchEvaluation`.
- Profile pages hydrate from `app/api/profile/overview/route.ts`, which batches Prisma reads for `questionHistory`, `userProfile`, and the `prayerMember` + `space` graph—keep related fields in that handler so cached queries stay coherent.
- Bible references use AO Lab endpoints through `utils/bibleUtils.ts` and mapping helpers in `utils/bookMappings.ts`.
- Daily devotionals rely on Tavily plus OpenAI JSON schema (`utils/devotionalUtils.ts`); guard execution when `TAVILY_API_KEY` is missing and require `Authorization: Bearer ${CRON_SECRET}` for cron routes.
- Church evaluations use Tavily crawl + Gemini 2.5 Flash parallel extraction (`utils/churchEvaluation.ts`); require `TAVILY_API_KEY` and `GEMINI_API_KEY` environment variables.

## Frontend Patterns
- Treat pages with hooks/effects as client components (`"use client"`); keep server components free of browser-only APIs.
- Streamed chat rendering in `app/[chatId]/page.tsx` depends on the `DataEvent` discriminated union—update types before emitting new events.
- Wrap any LLM output with `components/MarkdownWithBibleVerses.tsx` to preserve verse popovers; avoid duplicating parsing logic elsewhere.
- When adding stateful profile features, prefer `useProfileUiStore` for UI flags and `useQueryClient` updates (`updateProfileOverview`) over ad-hoc states.
- Shared styling leans on Tailwind and `components/ui/**`; reuse `Card`, `Button`, `Sheet`, etc. instead of bespoke markup.

## Brand Colors & Design System
- **Always use CSS variables** defined in `app/globals.css` instead of hardcoded colors—enables theme switching and maintains brand consistency.
- Reference `docs/CP Ministries/Design System.md` for end-to-end foundations, tokens, and component patterns.
- Reference `docs/CP Ministries/Color System Mapping.md` for comprehensive color usage guidelines and semantic meaning.
- Key brand colors: Deep Teal (`--accent`) for headers/links, Deep Blue (`--primary`) for actions, Sage Green (`--user-message`) for user content, Cream (`--background`) for warmth.
- Consult `docs/CP Ministries/Brand Identity.md` for overall brand voice, color psychology, and visual style guidelines.
- Use semantic Tailwind classes (`bg-primary`, `text-accent`) rather than arbitrary hex utility classes to maintain theme consistency.
- Light mode uses warm Cream backgrounds; dark mode uses pure white text for readability—both automatically adjust via CSS variables.

## Typography
- Global body font: Inter (variable) via `--font-sans`; headings use Source Serif 4 (variable) via `--font-serif`.
- Fonts are loaded in `app/layout.tsx` and applied in `app/globals.css` (`body` uses sans; `h1–h6` use serif).
- Prefer Tailwind classes `font-sans` and `font-serif` when overriding in components; these map to the CSS variables.

## Content & Prompt Style
- When writing or editing prompts, UI copy, or any website text, always consult the doctrinal and voice guide in `docs/Master prompt.md` to ensure alignment with tone, citations, and theological boundaries.
- Keep content consistent with the essentials/secondary/tertiary distinctions, pastoral tone, safety guardrails, and Scripture citation format described there.
- If a requested change appears to conflict with those guidelines, note the concern in your PR or ask for clarification before proceeding.

## Environment & Workflows
- `.env.template` lists required secrets: OpenAI keys, Tavily key, Prisma `DATABASE_URL`, `CRON_SECRET`, and Appwrite IDs; keep `GPT_MODEL` / `FT_MODEL` values aligned with `package.json` expectations.
- Dev loop: `npm install`, `npm run dev`; production build triggers `prisma generate && next build`.
- Run `npm run lint` before commits—TypeScript strict mode fails builds on unresolved types.
- Streaming handlers should favor `ReadableStream` + `sendProgress` over manual `Response` writes to avoid backpressure issues.
- Log data cautiously; redact Scripture and user content when adding diagnostics.
- **Auth helper for routes**: All new `app/api/**` handlers must use the shared cookie auth helper from [lib/auth.ts](../lib/auth.ts) (`requireAuthenticatedUser`/`getAuthenticatedUserId`) instead of manual `cookies()` reads or trusting body/query userId.
