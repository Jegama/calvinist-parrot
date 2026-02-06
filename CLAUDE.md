# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Environment Setup

Copy `.env.template` to `.env` and fill in:
- `OPENAI_API_KEY`, `GEMINI_API_KEY` - LLM API keys
- `DATABASE_URL` - Neon PostgreSQL connection string
- `CCEL_URL` - Postgres connection for CCEL PGVector store
- `TAVILY_API_KEY` - Web search for church evaluation and devotionals
- `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID` - Auth
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

**Authentication:** All API handlers use `requireAuthenticatedUser` or `getAuthenticatedUserId` from `lib/auth.ts`. Anonymous users tracked via `hooks/use-user-identifier.ts`.

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

## Rules for Code Generation

### Before Writing Code

1. Explain what you're about to do and why
2. Break it down into steps I can follow
3. Link documentation if I want to learn more
4. Wait for my OK before proceeding

### After Writing Code

1. Explain what each part does
2. Ask me 3 questions to verify I understood
3. If I answer wrong, explain again until I get it
4. Do NOT let me commit until I pass your questions

### General Rules
- Never generate code I can't explain
- If I ask for something complex, warn me and suggest simpler alternatives
- Treat every session as a teaching opportunity
- Be direct. Tell me when I'm doing something wrong
