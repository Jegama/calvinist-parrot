Implementation plan for bringing the husband-and-wife prayer tracker into the existing Calvinist Parrot Next.js&nbsp;15 application. The goal is to reuse our App Router, Appwrite/Prisma stack, streaming APIs, and LangGraph-based agents while introducing the new shared-family prayer workflows.

---

## 1. Product Shaping
- **Define shared family prayer persona:** Capture the core user journeys (setup, nightly prayer rotation, gratitude review) as additions to the current devotional/chat experience.
- **Prioritize MVP scope:** Shared family cards, personal prayer log, nightly rotation, scripture suggestions, and prayer focus summary. Defer CSV import/export, offline-first, and advanced analytics until the web experience proves value.
- **Surface entry points:** Decide where these flows live in the UI (e.g., new sidebar section, dedicated `app/prayer-tracker` route, or integrations inside existing chat experiences).
- **Mobile-first goal:** Treat responsive layouts as a first-class requirement so the tracker works seamlessly on phones from day one; prototype against the existing `Header` component and ensure menus scale for touch, along with offline hints on small screens.
- **Consent & disclosures:** Update product copy to explain how AI summaries and scripture suggestions use stored prayer data.

## 2. Data & Domain Modeling (Prisma/Postgres)
- **New core tables:**
  - `userProfile` (id, appwriteUserId, defaultSpaceId FK, totalPrayersOffered, totalRequestsAdded, streakDays, lastSeenAt).
  - `prayerFamilySpace` (id, shareCode, createdByUserId, archivedAt).
  - `prayerMember` (id, spaceId FK, appwriteUserId, displayName, role enum, joinedAt).
  - `prayerFamily` (id, spaceId FK, familyName, parents, children string[], categoryTag, lastPrayedAt, lastPrayedByMemberId FK, journalNotes, linkedScripture, archivedAt).
  - `prayerFamilyRequest` (id, familyId FK, status enum, requestText, notes, linkedScripture, dateAdded, dateUpdated, lastPrayedAt, answeredAt).
  - `prayerPersonalRequest` (id, spaceId FK, status enum, requestText, notes, linkedScripture, requesterMemberId FK, dateAdded, dateUpdated, lastPrayedAt, answeredAt).
  - `prayerJournalEntry` (id, spaceId FK, entryDate, entryText, tags string[]).
- **Migrations:** Extend `prisma/schema.prisma`, run `npx prisma migrate dev`, and update `prisma/migrations/**`.
- **Derived views:** Add Prisma helper queries for (a) nightly rotation scoring, (b) answered prayers, and (c) search filters.
- **RLS strategy:** Implement space-level access with `spaceId` + membership checks in API routes; rely on Appwrite user ID or cookie fallback.

## 3. Authentication & Sharing Mechanics
- **Space creation flow:** First authenticated user enters an onboarding wizard that creates a `prayerFamilySpace`, captures the family name, and only generates the share code after confirming they are ready to invite a spouse (avoids orphaned spaces).
- **Invitation flow:**
  - API endpoint to mint short-lived invitation tokens from the share code (`app/api/prayer-tracker/invite/route.ts`).
  - Accept invitation page that links a second Appwrite user into the same space.
- **Profile experience:** place an "Invite spouse" CTA on `app/profile/page.tsx` that surfaces the active share code, allows regenerating codes, and provides copy/share actions (QR code, deep link) tuned for mobile use.
  - Share flow UX: (1) user completes onboarding → space + share code created, (2) user opens Profile → Invite Spouse, (3) selects copy/share option, (4) spouse logs in and visits the invite link (or enters code on `/prayer-tracker/invite`), (5) acceptance endpoint binds their Appwrite account to the same `prayerFamilySpace`, and both accounts land on the shared dashboard.
- **Guard rails:** Ensure all new API routes check both authentication and membership ID before mutating data.

## 4. API Surface (Next.js App Router)
- **Namespace:** Create `app/api/prayer-tracker/**` with handlers that mirror existing streaming conventions.
- **Endpoints:**
  - `GET/POST /spaces` – create space, fetch membership.
  - `POST /invite` – produce invite token.
  - `POST /accept-invite` – link second account.
  - `GET/POST /families` – list/create family cards.
  - `PATCH /families/[id]` – update, archive, restore.
  - `GET/POST /families/[id]/requests` – manage family prayer requests.
  - `GET/POST /personal-requests` – manage “Our Family” prayer items.
  - `GET/POST /journal` – CRUD journal entries.
  - `GET /rotation` – compute “Praying Tonight” lineup; respond with JSON+progress events using `lib/progressUtils.sendProgress` to preserve streaming UX.
  - `POST /rotation/confirm` – batch update `lastPrayedAt` and track who prayed.
  - `POST /ai/prayer-focus` – call LangGraph tool chain to summarize selected items.
  - `POST /ai/suggest-scripture` – call Bible suggestion agent; reuse `utils/langChainAgents/tools`.
- **Validation:** Use Zod schemas in `lib/prompts.ts` or new `lib/validators/prayerTracker.ts` for request/response typing.

## 5. LangChain / AI Integration
- **Prayer focus tool:** Build new tool in `utils/langChainAgents/tools/prayerFocusTool.ts` that receives selected families/personal requests and returns structured focus copy; leverage existing OpenAI provider (`gpt-5-mini` default).
- **Scripture suggestion tool:** Adapt existing Bible utilities (`utils/bibleUtils.ts`, `utils/bookMappings.ts`) to enrich AI outputs with canonical verse metadata before rendering.
- **Streaming events:** Emit `progress`, `parrot`, and `gotQuestions` style events so the frontend can render incremental AI output similar to chat responses.
- **Prompt templates:** Add domain-specific prompts to `lib/prompts.ts` and update tests to catch regressions.

## 6. Frontend Implementation (App Router + shadcn UI)
- **Routes & layouts:**
  - Create `app/prayer-tracker/layout.tsx` for shared nav; wrap child routes with authentication guard.
  - Pages: `dashboard`, `families`, `praying-tonight`, `answered`, `settings`, `invite`.
- **Hooks & state:**
  - New hook `hooks/use-prayer-space.ts` to fetch current space, track share code, handle optimistic updates.
  - Reuse `use-mobile.tsx` patterns for responsive drawer behavior.
- **Components:**
  - `components/prayer-tracker/FamilyCardList.tsx`, `FamilyForm.tsx`, `PrayerRequestList.tsx`, `PersonalRequests.tsx`, `JournalTimeline.tsx`, `RotationPanel.tsx`, `PrayerFocusSheet.tsx`.
  - Leverage `components/ui` primitives; any complex logic gets brief inline comments.
  - Ensure LLM output flows through `components/MarkdownWithBibleVerses.tsx` for verse popovers.
- **Realtime UX:** Use optimistic UI updates + SWR/React Query (if introduced) or Next.js `use` pattern for server actions; consider Revalidate Tag approach to refresh lists after mutations.
- **Responsive patterns:** Extend `components/Header.tsx` to expose tracker links via the existing menu patterns (desktop inline, mobile dropdown), layer in a floating quick-add only where needed, and ensure modal sheets adapt to mobile via full-height drawers.
- **Profile integration:** Fetch aggregates from `userProfile` to power `app/profile/page.tsx`, showing totals, streaks, and recent activity alongside existing question history.

## 7. Nightly Rotation Logic
- **Scoring algorithm:** Implement in `lib/prayerRotation.ts` with deterministic selection rules described in the original prompt (prioritize never prayed, oldest timestamps, ensure 4 families + 3-5 personal requests shared across both members).
- **Confirmation UX:** Provide toggles for “John prayed / Sarah prayed” using the configured member names; update DB via `rotation/confirm` endpoint.
- **Shared visibility:** Both members see the same rotation lineup of four family cards and the selected personal requests so either spouse can act when the other is unavailable; confirmation updates the `lastPrayedByMemberId` while keeping items visible until the nightly session is marked complete.
- **Manual overrides:** Allow users to add/remove items from rotation panel before confirming; persist overrides as additional `lastPrayedAt` updates.
- **Activity logging:** Optional table or event log to fuel future insights.

## 8. Settings & Data Management
- **Display names:** Settings page to edit the two member names (`prayerMember.displayName`).
- **CSV import/export (phase two):** Outline data transformers but gate behind feature flag; store design notes in this doc until prioritised.
- **Share code management:** Regenerate share code, revoke invites, view linked accounts.
- **Privacy copy:** Update Terms/Privacy content if needed.

## 9. Answered Prayers & Search Views
- **Answered list:** Build server component that queries both family and personal requests with `status === "Answered"`; add filters and sorting.
- **Global search:** Client page with search bar hitting `/api/prayer-tracker/search` (full-text via Prisma `contains` filters) covering families, requests, and journal notes.
- **Quick Add:** Floating action button in tracker layout; opens modal for selecting family/personal context and capturing request data.

## 10. Testing & Quality Gates
- **Unit tests:**
  - Rotation algorithm (edge cases: insufficient items, archived families).
  - Prisma utilities for membership checks.
  - AI tool prompt formatting.
- **Integration tests:**
  - API route smoke tests with Supertest or Next test client.
  - Frontend component tests via Playwright/Test React to ensure streaming updates render.
- **Manual QA checklist:** Invite flow, concurrent edits, AI summary generation, archiving, answered transitions.
- **Performance:** Monitor Prisma query counts; add indexes for `lastPrayedAt`, `status`, and text search fields.

## 11. Deployment & Rollout
- **Environment vars:** Add `PRAYER_TRACKER_FEATURE_FLAG`, `PRAYER_INVITE_TOKEN_SECRET`, `PRAYER_SHARE_CODE_SALT` to `.env.template` and Vercel secrets.
- **Migrations:** Schedule downtime window or use zero-downtime migration strategy; verify on staging with `npx prisma studio`.
- **Feature flagging:** Gate UI behind flag until beta-ready; gradually roll out to select Appwrite users.
- **Analytics:** Instrument basic tracking (page views, rotation confirmations) using existing logging patterns.
- **Documentation:** Update README and internal runbooks; provide user-facing help article summarizing the new tracker.

---

### Future Enhancements (Post-MVP)
- Offline caching via service workers/PWA enhancements.
- Native shell wrappers (React Native, Capacitor) if deeper offline support or push notifications are needed beyond the responsive web experience.
- Deeper analytics (prayer streaks, answered prayer timelines).
- Shared metrics dashboard for ministry leaders.
