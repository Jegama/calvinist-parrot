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
- **Prayer Tracker:** UI in `app/prayer-tracker`; APIs in `app/api/prayer-tracker`. Uses unified request system (`familyId` null = household). See `.github/instructions/prayer-tracker.instructions.md` for patterns.
- **Church Finder:** UI in `app/church-finder`; APIs in `app/api/churches`. AI evaluation pipeline uses Tavily + Gemini. See `.github/instructions/church-finder.instructions.md` for details.
- **Journal:** UI in `app/journal`; APIs in `app/api/journal`. Streams NDJSON events for progressive AI reflection. See `.github/instructions/journal-api.instructions.md` and `.github/instructions/journal-ui.instructions.md` for patterns.

## Data & Integrations
- Prisma schema in `prisma/schema.prisma`; run `npx prisma migrate dev` after edits.
- Tables: `chatHistory`, `chatMessage` (chat), `questionHistory` (QA), `parrotDevotionals`, prayer tracker tables (`20250103*`, `20251011*` migrations), church finder tables (`church`, `churchAddress`, `churchServiceTime`, `churchEvaluation`).
- Profile API batches reads in `app/api/profile/overview/route.ts`.
- Bible refs use AO Lab endpoints via `utils/bibleUtils.ts`.
- Daily devotionals use Tavily + OpenAI; require `TAVILY_API_KEY` and `Authorization: Bearer ${CRON_SECRET}` for cron.
- Church evaluations use Tavily + Gemini; require `TAVILY_API_KEY` and `GEMINI_API_KEY`.

## Frontend Patterns
- Treat pages with hooks/effects as client components (`"use client"`); keep server components free of browser-only APIs.
- Streamed chat rendering in `app/[chatId]/page.tsx` depends on the `DataEvent` discriminated union—update types before emitting new events.
- Wrap any LLM output with `components/MarkdownWithBibleVerses.tsx` to preserve verse popovers; avoid duplicating parsing logic elsewhere.
- When adding stateful profile features, prefer `useProfileUiStore` for UI flags and `useQueryClient` updates (`updateProfileOverview`) over ad-hoc states.
- Shared styling leans on Tailwind and `components/ui/**`; reuse `Card`, `Button`, `Sheet`, etc. instead of bespoke markup.

### Standardized Page Headers
All main feature pages follow a consistent header pattern for visual cohesion:
```tsx
<header className="mb-8">
  <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Page Title</h1>
      <p className="text-muted-foreground">Subtitle or description</p>
    </div>
    {/* Action buttons (right-aligned on desktop, full-width on mobile) */}
    <Button className="w-full sm:w-auto">Primary Action</Button>
  </div>
</header>
```
**Key requirements:**
- Semantic `<header>` wrapper with `mb-8` spacing
- H1 uses `text-3xl font-serif font-bold text-foreground mb-2` (Source Serif 4 typography)
- Subtitle uses `text-muted-foreground` (no custom sizing)
- Responsive flex layout: `gap-4` between sections, `mb-4` after header row
- Buttons: `w-full sm:w-auto` for mobile-first responsive behavior
- Container padding: `py-8` and `px-4 sm:px-6` on parent container

Examples: `/journal`, `/prayer-tracker`, `/church-finder`, `/llm-evaluation-dashboard`

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
- Required env vars: OpenAI keys, Tavily key, Gemini key, Prisma `DATABASE_URL`, `CRON_SECRET`, Appwrite IDs.
- Dev: `npm install`, `npm run dev`; build: `prisma generate && next build`.
- Run `npm run lint` before commits—TypeScript strict mode enabled.
- Streaming handlers: use `ReadableStream` + `sendProgress` to avoid backpressure.
- Log cautiously; redact Scripture and user content.
- **Auth for APIs:** All `app/api/**` handlers must use `requireAuthenticatedUser` or `getAuthenticatedUserId` from `lib/auth.ts` instead of manual cookie reads.
