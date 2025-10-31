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

## Prayer Tracker Module
- Feature lives in `app/prayer-tracker/**` with sheets, rotation logic, and helpers split into `components/` and `utils.ts`.
- API routes mirror the UI: `spaces`, `families`, `requests`, `rotation`, `rotation/confirm`, `journal`, and `invite`; each expects an Appwrite `userId` (use `appendUserId` when invoking from server code).
- **Unified Request System**: `personal-requests` routes were refactored to `requests`; now handles both household-level requests (`prayerPersonalRequest`) and family-specific requests (`prayerFamilyRequest`) through a single unified API using the `UnifiedRequest` type with a `familyId` discriminator (null = household, set = family-specific).
- Rotations compute member assignments in `/api/prayer-tracker/rotation/route.ts`; confirm endpoint writes Prisma records to `prayerRotation`, `prayerLog`, and request statuses for both household and family requests.
- `app/prayer-tracker/page.tsx` keeps rotation state client-side with unified request management; components include `RequestSheet` (formerly `PersonalSheet`), `RequestsSection` (formerly `PersonalRequestsSection`), and new `FamilyDetailDialog` for viewing family info and their specific requests.
- Follow the existing `fetch` patterns in `app/prayer-tracker/api.ts` for optimistic updates, error messaging via `handleApiError`, and category normalization helpers; API module exports typed `Result<T, E>` for consistent error handling.

## Church Finder Module
- Feature lives in `app/church-finder/**` with interactive map, filtering, discovery panel, and detail dialogs split across `components/`.
- API routes under `app/api/churches/**`: root GET/POST for list/create, `[id]` for details, `search` for OpenStreetMap queries, `check` for existence validation, `meta` for filter dropdowns.
- **AI-Powered Evaluation System**: Church creation (`POST /api/churches`) triggers an automated multi-stage LLM evaluation workflow via `utils/churchEvaluation.ts`:
  - **Tavily Crawl**: Website content extraction using `tavily.crawl()` with duplicate anchor removal (`dropAnchorDupes`).
  - **Parallel LLM Calls**: Six concurrent Gemini 2.5 Flash calls for basic fields, core doctrines, secondary/tertiary doctrines, denomination/confession, and red flags using schemas from `lib/schemas/church-finder.ts` and prompts from `lib/prompts/church-finder.ts`.
  - **Post-Processing**: Status classification (Historic Reformed, Recommended, Biblically Sound with Differences, Limited Information, Not Endorsed) based on core doctrine coverage, confession adoption, and red flags via `postProcessEvaluation`.
  - **Confession Inference**: Auto-populates missing doctrine data when historic confessions detected using `utils/confessionInference.ts`.
  - **Badge System**: Allowlisted badges filtered through `utils/badges.ts`; only approved badges persist to prevent LLM hallucination.
- **Core Doctrines**: Ten essential beliefs (trinity, gospel, justification by faith, Christ's deity/humanity, scripture authority, incarnation/virgin birth, atonement, resurrection, return/judgment, character of God) evaluated as `true/false/unknown` and stored in normalized Prisma columns.
- **Secondary/Tertiary Doctrines**: JSON storage for non-essential beliefs (baptism, governance, eschatology, worship style, etc.) with structured extraction.
- **Church Sorting**: Priority-based ordering in list view (Historic Reformed → Recommended → Biblically Sound → Limited Info → Not Endorsed) using `sortChurchesByPriority` helper in `app/api/churches/route.ts`.
- **Discovery Workflow**: `ChurchDiscoveryPanel` component searches OpenStreetMap via Nominatim API, checks existence with `/api/churches/check`, creates new churches with loading states (Fetching → Analyzing → Complete), and manages optimistic updates.
- **Filtering**: Status-based filtering (`exclude_red_flag` default), state/city dropdowns populated from `/api/churches/meta`, denomination and confessional toggles, pagination with 10 items per page.
- **Map Integration**: Leaflet map in `ChurchMap` component with marker clustering, popups, and height syncing via `ResizeObserver`; lazy-loaded through `SafeMapContainer` to avoid SSR issues.
- **Data Mappers**: `lib/churchMapper.ts` transforms Prisma relations to API types (`ChurchListItem`, `ChurchDetail`, `ChurchEvaluationRecord`) with doctrine value normalization.
- **Geocoding**: Google Maps API integration in `utils/churchEvaluation.ts` for address → lat/lng conversion; handles multiple addresses per church with primary flag.
- **Types**: Comprehensive TypeScript definitions in `types/church.ts` for evaluation workflow, API responses, and doctrine maps.
- Prisma tables: `church`, `churchAddress`, `churchServiceTime`, `churchEvaluation`; evaluations are immutable records (re-evaluation creates new rows).
- Follow existing patterns in `app/church-finder/api.ts` for `fetch` calls, query key structure (`["churches", page, state, city, ...]`), and TanStack Query cache updates.

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
