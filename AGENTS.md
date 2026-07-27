# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Documentation Style

- Do not hard-wrap Markdown prose to a fixed maximum column width. Keep each paragraph and list item on one logical line unless Markdown structure, a code block, or readability genuinely requires a line break.

## GitHub CLI Authentication in Codex

- On macOS, Codex's sandbox may be unable to read the GitHub CLI credential stored in Keychain, causing a sandboxed `gh auth status` to incorrectly report that the active token is invalid even after a successful login.
- If a sandboxed GitHub CLI authentication check fails, do not immediately ask the user to log in again. First rerun `gh auth status` with the required elevated/Keychain access and treat that result as authoritative.
- Run subsequent `gh` commands that require the stored credential with the same Keychain-capable access. Never print, copy, or persist the authentication token.

## Project Overview

Calvinist Parrot is an AI-powered theological assistant built with Next.js 16, React 19, and TypeScript. It combines Reformed theology with modern AI to provide biblical guidance through chat, journaling, prayer tracking, kids discipleship, and church discovery features.

**Live site:** https://www.calvinistparrot.com/

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production (runs prisma generate first)
npm run start        # Start production server
npm run lint         # Run ESLint
```

**Database commands:**
```bash
npx prisma migrate dev      # Apply migrations to dev database
npx prisma migrate deploy   # Apply migrations to production
npx prisma studio           # Visual database manager
npx prisma generate         # Regenerate Prisma client after schema changes
```

For completed Codex worktrees, use the repository-local `$teardown-worktree` skill. It previews and removes only the path-derived development, shadow, and test databases before removing the Git worktree. Never use `docker compose down -v` for worktree cleanup because the Docker volume is shared.

## Environment Setup

Copy `.env.template` to `.env` and fill in:
- `OPENAI_API_KEY`, `GEMINI_API_KEY` - LLM API keys
- `DATABASE_URL` - Neon PostgreSQL connection string
- `CCEL_URL` - Postgres connection for CCEL PGVector store
- `TAVILY_API_KEY` - Web search for church evaluation and devotionals
- `APPWRITE_ENDPOINT` - Server-side Appwrite API endpoint
- `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID` - Client-side Auth
- `CRON_SECRET` - For scheduled devotional generation
- `GEOAPIFY_API_KEY` - Maps/location API for church finder

## Architecture Overview

### Conversational Pipelines

**`/api/parrot-chat`** (recommended) - LangGraph agent that streams JSONL events. Main agent defined in `utils/langChainAgents/mainAgent.ts` with tools in `utils/langChainAgents/tools/`. Conversation state persisted to PostgreSQL via LangGraph checkpointing.

**`/api/parrot-qa`** (legacy) - "Counsel of Three" workflow with Calvin-style review synthesis.

### Feature Modules

| Feature | UI Path | API Path | Instructions |
|---------|---------|----------|--------------|
| Chat | `app/[chatId]/` | `app/api/parrot-chat/` | - |
| Journal | `app/journal/` | `app/api/journal/` | `.github/instructions/journal-*.md` |
| Kids Discipleship | `app/kids-discipleship/` | `app/api/kids-discipleship/` | `.github/instructions/kids-discipleship-*.md` |
| Prayer Tracker | `app/prayer-tracker/` | `app/api/prayer-tracker/` | `.github/instructions/prayer-tracker.instructions.md` |
| Church Finder | `app/church-finder/` | `app/api/churches/` | `.github/instructions/church-finder.instructions.md` |

### Key Patterns

**Authentication:** All API handlers use `requireAuthenticatedUser` or `getAuthenticatedUserId` from `lib/auth.ts`. Authenticated identity comes from the Appwrite session cookie; anonymous chat continuity uses the server-managed `guestId` cookie in `lib/guest.ts`. Client-side API functions must not accept `userId` — identity is always resolved server-side. On login, guest chats transfer automatically. On logout, `queryClient.clear()` wipes cached data and a hard navigation to `/` prevents race conditions with `ProtectedView`. Rate limiting for sensitive endpoints uses `lib/rate-limit.ts`.

**Streaming:** JSONL/NDJSON events via `lib/progressUtils.sendProgress`. Chat UI keys on `{type}` values.

**State Management:** TanStack Query v5 for server state (5-min stale window), Zustand for UI state (`app/profile/ui-store.ts`).

**Bible Verse Rendering:** Always wrap LLM output with `components/MarkdownWithBibleVerses.tsx` to preserve verse popovers.

**Page Height:** Use `min-h-[calc(100vh-var(--app-header-height))]` instead of `min-h-screen` to account for sticky header.

### Database Schema

Prisma schema in `prisma/schema.prisma`. Key tables:
- `chatHistory`, `chatMessage` - Conversations
- `journalEntry`, `journalEntryAI` - Personal journal with AI reflection
- `prayerFamilySpace`, `prayerFamily*`, `prayerPersonalRequest` - Prayer tracker (household-based)
- `discipleshipAnnualPlan`, `discipleshipMonthlyVision` - Kids discipleship
- `church`, `churchEvaluation` - Church finder with AI doctrinal evaluation
- `userProfile` - User preferences and denomination

## Theological Guidelines

All AI content must align with `docs/theology/Master prompt.md`:

**Core Doctrines (non-negotiable):** Trinity, Scripture authority, Christ's deity, Gospel, Justification by faith, Resurrection

**Secondary Doctrines (denominational):** Baptism mode, church governance, Lord's Supper, spiritual gifts, sanctification views

**Voice Requirements:**
- Pastoral care and encouragement
- Gentleness in apologetics
- Scripture citations included inline (not abbreviated)
- Safety guardrails (emergency hotlines, refer to ACBC counselors when appropriate)

## Design System

Use CSS variables from `app/globals.css`, not hardcoded colors:
- `--accent` (Deep Teal) - Headers, links
- `--primary` (Deep Blue) - Actions
- `--user-message` (Sage Green) - User content
- `--background` (Cream) - Warm backgrounds

Typography: Inter (body via `font-sans`), Source Serif 4 (headings via `font-serif`).

Reference `docs/design/Design System.md` and `docs/design/Color System Mapping.md` for detailed guidelines.
