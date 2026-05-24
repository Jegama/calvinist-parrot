# Appwrite Expansion Plan

## Objective
Maximize the ROI of the Appwrite subscription by offloading specific infrastructure components from Vercel and adding new capabilities, while keeping the Next.js frontend on Vercel and the relational database on Neon/Prisma.

## Excluded from Migration
*   **Database:** Keep Prisma + Neon PostgreSQL. The application relies heavily on relational mapping and pgvector for AI memory and Bible search, which is optimal as-is.
*   **Frontend Hosting:** Keep Next.js on Vercel.

---

## Phase 1: File & Media Storage (Low Complexity)
*Target: Allow users to upload media without requiring costly Vercel Blob storage or external AWS S3 buckets.*

**Use Cases:**
1. User custom profile pictures.
2. Image attachments for Journal entries.
3. Custom bulletin/facility images for Church Finder submissions.

**Implementation Steps:**
1. **Appwrite Console:** Create a new Storage Bucket (e.g., `user-media`), set file size limits, and define read/write permissions based on the Auth session.
2. **Codebase (`lib/appwrite/`):** Export the `Storage` service from the existing Appwrite client wrapper.
3. **UI Integration:** Add a file input dropzone component in the `app/profile/` and `app/journal/` routes.
4. **Backend:** Save the generated Appwrite file ID as a string field in the relevant Prisma schemas (e.g., `avatarFileId` in `userProfile`, `attachmentId` in `journalEntry`).

---

## Phase 2: Notifications & Messaging (Low/Medium Complexity)
*Target: Increase daily user engagement by leveraging Appwrite Messaging for automated email and push notifications, replacing external providers.*

**Use Cases:**
1. Weekly reminders to update or pray for items in the **Prayer Tracker**.
2. Notifications for the **Kids Discipleship** monthly vision recaps.
3. Daily/Weekly email delivery of generated **Devotionals**.

**Implementation Steps:**
1. **Appwrite Console:** Enable the Messaging provider (add SMTP credentials for email).
2. **Database:** Add a `notificationPreferences` JSON or boolean fields to the `userProfile` Prisma model.
3. **Codebase:** Create a `lib/messaging.ts` utility using the server-side Appwrite SDK (`node-appwrite`) to dispatch messages based on user IDs.

---

## Phase 3: Background Jobs & Heavy AI Functions (Medium Complexity)
*Target: Escape Vercel's strict serverless timeout limits (and potential costs) for long-running AI operations and cron jobs.*

**Use Cases:**
1. **Tavily/LangGraph web scraping** and subsequent Gemini/OpenAI evaluation (especially the Church Evaluator pipeline).
2. **Cron Jobs:** The daily Devotional generator loop that currently relies on Vercel Cron + `CRON_SECRET`.

**Implementation Steps:**
1. **Appwrite Console:** Create new Node.js/Bun Functions. Route your `TAVILY_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY` as function environment variables.
2. **Codebase Extraction:** Move the heavy processing algorithms out of Next.js `/api/*` routes into standalone Appwrite Function repositories.
3. **Execution:** 
   * Set up Appwrite's built-in cron scheduler to trigger the Daily Devotional generators.
   * Have the Next.js frontend or lightweight API trigger the Appwrite Function asynchronously for the Church Evaluator, so the Vercel function can respond immediately while the Appwrite Function does the hard work.

---

## Phase 4: Real-time Collaboration (High Complexity)
*Target: Enhance the multi-user household experience so that actions on one device instantly reflect on another.*

**Use Cases:**
1. **Prayer Tracker:** Live syncing when family members mark a prayer request as "answered" or add a new one to the household board.
2. **Kids Discipleship:** Live updates to the annual plan/monthly vision blocks.

**Implementation Steps:**
1. **Data Sync Strategy:** Since the source of truth is Prisma/PostgreSQL, we treat Appwrite Realtime as an ephemeral event bus.
2. **Codebase (Server):** When a user completes a mutation (e.g., updating a prayer request) via existing Next.js APIs, the server publishes a custom event to an Appwrite Realtime channel for that specific household/family ID.
3. **Codebase (Client):** Use the Appwrite client SDK to subscribe to household channels. When an event is received, trigger a targeted TanStack Query `queryClient.invalidateQueries({ queryKey: ["prayer-list", familyId] })` to fetch the fresh data seamlessly.
