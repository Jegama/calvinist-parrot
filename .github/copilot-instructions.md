# Calvinist Parrot – AI Agent Guide
## Overview & Entry Points
- Next.js 15 App Router with TypeScript; route handlers under `app/api/**`, router pages/layouts under `app/**`.
- Auth flows lean on Appwrite (`hooks/use-auth.tsx`) with a `userId` cookie fallback (`app/page.tsx`, `app/[chatId]/page.tsx`).
- Prisma Postgres schema lives in `prisma/schema.prisma`; run `npx prisma migrate dev` after edits to keep migrations in sync.
- Shared UI primitives follow the shadcn pattern in `components/ui/**`; compose them inside page-level components and feature modules.

## Conversational Pipelines
- `/api/parrot-chat` streams JSONL events via `lib/progressUtils.sendProgress`; the chat UI keys on `{type}` values (`progress`, `parrot`, `gotQuestions`, etc.).
- `utils/langChainAgents/mainAgent.ts` defines the LangGraph agent; new tools register in `utils/langChainAgents/tools/index.ts` and follow the Tavily whitelist in `supplementalArticleSearchTool.ts`.
- `/api/parrot-qa` orchestrates the "Counsel of Three" workflow, Calvin review, and stores results in Prisma `questionHistory`.
- Conversation titles and categories reuse mini OpenAI models through `utils/generateConversationName.ts` and prompt constants in `lib/prompts.ts`.

## Prayer Tracker Module
- Feature lives in `app/prayer-tracker/**` with sheets, rotation logic, and helpers split into `components/` and `utils.ts`.
- API routes mirror the UI: `spaces`, `families`, `personal-requests`, `rotation`, `rotation/confirm`, `journal`, and `invite`; each expects an Appwrite `userId` (use `appendUserId` when invoking from server code).
- Rotations compute member assignments in `/api/prayer-tracker/rotation/route.ts`; confirm endpoint writes Prisma records to `prayerRotation`, `prayerLog`, and personal request statuses.
- `app/prayer-tracker/page.tsx` keeps rotation state client-side; follow the existing `fetch` patterns for optimistic updates, error messaging via `readErrorMessage`, and category normalization helpers.

## Data & Integrations
- Chat history tables: `prisma/chatHistory`, `prisma/chatMessage`; QA uses `questionHistory`; devotionals persist in `parrotDevotionals`; prayer tracker tables defined in latest migrations (`20250103*`, `20251011*`).
- Bible references use AO Lab endpoints through `utils/bibleUtils.ts` and mapping helpers in `utils/bookMappings.ts`.
- Daily devotionals rely on Tavily plus OpenAI JSON schema (`utils/devotionalUtils.ts`); guard execution when `TAVILY_API_KEY` is missing and require `Authorization: Bearer ${CRON_SECRET}` for cron routes.

## Frontend Patterns
- Treat pages with hooks/effects as client components (`"use client"`); keep server components free of browser-only APIs.
- Streamed chat rendering in `app/[chatId]/page.tsx` depends on the `DataEvent` discriminated union—update types before emitting new events.
- Wrap any LLM output with `components/MarkdownWithBibleVerses.tsx` to preserve verse popovers; avoid duplicating parsing logic elsewhere.
- Shared styling leans on Tailwind and `components/ui/**`; reuse `Card`, `Button`, `Sheet`, etc. instead of bespoke markup.

## Brand Colors & Design System
- **Always use CSS variables** defined in `app/globals.css` instead of hardcoded colors—enables theme switching and maintains brand consistency.
- Reference `docs/CP Ministries/Color System Mapping.md` for comprehensive color usage guidelines and semantic meaning.
- Key brand colors: Deep Teal (`--accent`) for headers/links, Deep Blue (`--primary`) for actions, Sage Green (`--user-message`) for user content, Cream (`--background`) for warmth.
- Consult `docs/CP Ministries/Brand Identity.md` for overall brand voice, color psychology, and visual style guidelines.
- Use semantic Tailwind classes (`bg-primary`, `text-accent`) rather than arbitrary hex utility classes to maintain theme consistency.
- Light mode uses warm Cream backgrounds; dark mode uses pure white text for readability—both automatically adjust via CSS variables.

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
