# Memory System Architecture - Implementation Summary

## Overview
This document describes the memory system's dual-storage architecture optimized for pastoral care and personalization. The system uses **Prisma (PostgreSQL)** for structured context and **MemoryStore (JSON)** for unstructured conversation memories.

## 🏗️ Architecture Principles

### Two-Tier Storage Model

**Prisma (Structured Context):**
- User-controlled preferences (denomination)
- Automatically inferred metadata (spiritual status, doctrinal question counts, learning preferences)
- Ministry context and church involvement
- **Injected directly into system prompt** for every conversation
- Fast queries, strong typing, efficient indexing

**MemoryStore (Unstructured Memories):**
- Theological interests (topics, counts, contexts)
- Personal concerns and spiritual journey notes
- Life stage observations
- **Retrieved via `userMemoryRecall` tool** when agent needs specific details
- Semantic search enabled, flexible schema

### Context Delivery Strategy

1. **System Prompt Injection (Automatic)**: Route.ts fetches userProfile from Prisma and injects denomination, spiritual status, learning preferences, ministry context, and doctrinal question counts into system prompt before every conversation
2. **Tool-Based Recall (On-Demand)**: Agent calls `userMemoryRecall` tool naturally when it needs specific details about user's interests, concerns, or prior discussions
3. **No Forced Retrieval**: Removed automatic memory recall at conversation start - agent decides when to use tool

## ✅ Completed Implementation

### 1. Prisma Schema (`prisma/schema.prisma`)

```prisma
model userProfile {
  // Theological Preferences (USER-CONTROLLED)
  denomination               String?   @default("reformed-baptist")
  
  // Learning Preferences (AUTO-INFERRED)
  preferredDepth             String?   @default("concise") // "concise" | "moderate" | "detailed"
  followUpTendency           String?   // "deep_diver" | "quick_mover" | "balanced" | null
  
  // Spiritual Journey Tracking (PRIVATE - for pastoral sensitivity only)
  spiritualStatus            String?   // "seeker" | "new_believer" | "mature_believer" | "unclear"
  gospelPresentedAt          DateTime? // Last Gospel presentation timestamp
  gospelPresentationCount    Int       @default(0)
  
  // Doctrinal Question Tracking (AUTO-INFERRED)
  coreDoctrineQuestions      Int       @default(0)
  secondaryDoctrineQuestions Int       @default(0)
  tertiaryDoctrineQuestions  Int       @default(0)
  
  // Ministry & Life Context (AUTO-INFERRED)
  ministryContext            String[]  // ["parent", "pastor", "teacher", etc.]
  churchInvolvement          String?   // "active_member" | "seeking_church" | "unclear"
}
```

**Key Decision**: `denomination` is **user-controlled** (profile page selector), NOT LLM-inferred.
**Added Theological Preferences Card:**
- Dropdown selector with 7 denominations (reformed-baptist, presbyterian, wesleyan, lutheran, anglican, pentecostal, non-denom)
- Calls `PATCH /api/user-profile` on change
- Refetches profile data after update

**Updated API (`app/api/user-profile/route.ts`):**
- Added `PATCH` method for denomination updates
- Validates against 7 allowed denominations
- Uses Prisma `upsert` to create profile if missing

### 3. System Prompt Injection (`app/api/parrot-chat/route.ts`)

**New Flow (Lines 156-248):**
```typescript
// 1. Fetch userProfile from Prisma
const userProfile = await prisma.userProfile.findUnique({
  where: { appwriteUserId: effectiveUserId },
  select: {
    denomination: true,
    preferredDepth: true,
    followUpTendency: true,
    spiritualStatus: true,  // PRIVATE - for internal use only
    gospelPresentationCount: true,
    coreDoctrineQuestions: true,
const buildPastoralContext = (): string => {
  // ... formats all Prisma data into agent-friendly context
// 3. Inject into system prompt
const pastoralContext = buildPastoralContext();
newParrotSysPrompt = newParrotSysPrompt.replace('{PASTORAL_CONTEXT}', pastoralContext);
```

**Removed (Lines 350-454):**
Follow-up tendency normalization used in pastoral context:

- `deep_diver` → “Frequently asks follow-ups”
- `quick_mover` → “Prefers standalone answers”
- `balanced` → “Moderate follow-up engagement”
- Forced memory recall cache logic
- Automatic tool invocation hint at conversation start
- Redundant MemoryStore queries before every message

### 4. Updated System Prompt (`lib/prompts/core.ts`)

**Added `{PASTORAL_CONTEXT}` Placeholder:**
- Positioned between `{CORE}` and tool usage instructions
- Filled with structured Prisma data by route.ts
- **Removed** denomination/ministry context/learning preferences from tool description (already in prompt)
- **Updated** privacy rule to clarify spiritual status is in prompt, not tool output

**Major Simplification:**

  - Theological interests (topic counts)
  - Personal concerns
  - Spiritual journey notes


**Kept Intact:**
- LLM extraction of spiritual status, doctrinal tiers, ministry context, learning preferences
- `syncToPrisma()` function to update structured fields
- Merge logic for unstructured memories in MemoryStore

**Removed:**
- Denomination extraction (now user-controlled)
- Comments referencing denomination as LLM-inferred

**Updated Flow:**
1. Extract memories from conversation (LLM)
2. Sync structured data to Prisma (spiritual status, doctrinal counts, ministry context, learning prefs)
3. Merge unstructured data (interests, concerns, journey)

### 7. Memory Prompts (`lib/prompts/memory.ts`)

**No Changes Needed** - prompts were already designed to skip denomination.

### 8. Backfill Script (`scripts/backfill-memories.ts`)

**Updated:**
- Removed `denomination` parameter from `updateUserMemoriesFromConversation` calls
- Script no longer passes `currentChat?.denomination` to memory extraction
 - Added `--oldest=<n>` CLI flag to process only the first N oldest conversations per user (e.g., `--oldest=10`)
   - Conversations are processed in ascending `createdAt` order; the limit applies per user
   - Recommended for quick, low-cost tests on a single account

## 🎯 Benefits of New Architecture

### 1. **Separation of Concerns**
- **User preferences** (denomination) → User-controlled UI
- **Inferred context** (spiritual status, learning style) → LLM extraction
- **Unstructured memories** (interests, concerns) → MemoryStore JSON

### 2. **Performance Optimization**
- System prompt injection: 1 Prisma query per conversation (vs. N queries per tool call)
- Tool calls reduced: Only when agent needs specific memory details
- No forced retrieval overhead at conversation start

### 3. **Clearer Agent Behavior**
- Structured context (denomination, ministry role) always available in prompt
- Agent calls `userMemoryRecall` naturally when it needs specific details
- No confusing "forced hint" injections

### 4. **Privacy by Design**
- Spiritual status in system prompt (agent sees it) but NEVER in tool output (can't leak)
- Explicit privacy warnings in prompt injection code
- Clear separation between "internal use" and "tool-accessible" data

## 🔒 Privacy Safeguards

### Spiritual Status Handling

**Source**: Prisma `userProfile.spiritualStatus` (inferred by LLM from conversation cues)

**Visibility**:
- ✅ Injected into system prompt (agent uses for tone/depth/Gospel emphasis)
- ❌ NEVER in `userMemoryRecall` tool output (removed Prisma queries)
- ❌ NEVER mentioned to user (explicit prompt warnings)

**Privacy Rules in Code**:
1. **Prompt Injection (`route.ts` line 188-194)**:
   ```typescript
   if (userProfile.spiritualStatus) {
     const statusMap = {
       seeker: 'Exploring faith (emphasize Gospel clarity, avoid jargon)',
       new_believer: 'Recently saved (gentle discipleship, foundational truths)',
       // ...
     };
     lines.push(`- **Spiritual Maturity** (PRIVATE): ${statusMap[userProfile.spiritualStatus]}`);
   }
   ```

2. **System Prompt Warning (`core.ts` line 170)**:
   ```
   **CRITICAL PRIVACY RULE**: The memory system tracks spiritual status (seeker, new believer, mature believer) for YOUR pastoral sensitivity only (see pastoral context above). NEVER mention this tracking to the user, NEVER say things like "I see you're a seeker" or "Based on your spiritual status." Use this information silently to tailor your tone, depth, and Gospel emphasis appropriately.
   ```

3. **Tool Simplification (`userMemoryRecallTool.ts`)**:
   - Removed all Prisma queries (including spiritual status)
   - Tool now only returns MemoryStore data (no private fields)

## 📊 Example Use Cases

### Scenario 1: Seeker Asks About Sin
**Prompt Injection (Automatic):**
- Denomination: reformed-baptist
- Spiritual Maturity (PRIVATE): Exploring faith
- Gospel Presentations Received: 0 times
- Doctrinal Question History: 3 core, 0 secondary, 0 tertiary

**Agent Behavior:**
- Uses simple language (sees "Exploring faith" guidance)
- Includes clear Gospel presentation (sees 0 prior presentations)
- Avoids theological jargon
- Adds explicit invitation to trust Christ

**Tool Usage:**
- Agent may call `userMemoryRecall` if it wants to reference prior questions about sin
- Tool returns unstructured memories (e.g., "concerned about guilt from past actions")

### Scenario 2: Pastor Asks About Baptism
**Prompt Injection (Automatic):**
- Denomination: presbyterian
- Ministry Roles: pastor, church_leader
- Doctrinal Question History: 2 core, 8 secondary, 3 tertiary
- Preferred Answer Depth: moderate

**Agent Behavior:**
- Applies Presbyterian secondary doctrines (infant baptism)
- Uses church leadership illustrations
- Assumes theological literacy (high secondary question count)
- Provides moderate-length answer (3-5 paragraphs)

**Tool Usage:**
- Agent may call `userMemoryRecall` to check if pastor previously discussed baptism theology
- Tool returns theological interests (e.g., "covenant theology" mentioned 5 times)

### Scenario 3: Parent Asks About Family Worship
**Prompt Injection (Automatic):**
- Denomination: reformed-baptist
- Ministry Roles: parent
- Preferred Answer Depth: concise
- Church Involvement: active_member

**Agent Behavior:**
- Keeps answer brief (60-100 words)
- Uses family-specific examples (catechism with kids)
- Applies Reformed Baptist framework
- Assumes active church connection

**Tool Usage:**
- Agent may call `userMemoryRecall` if parent mentioned specific family struggles
- Tool returns concerns (e.g., "kids losing interest in devotions")

## 🧪 Testing Checklist

### Functional Tests
- [ ] Denomination selector in profile page updates Prisma
- [ ] System prompt includes pastoral context (check logs)
- [ ] Secondary doctrines change based on denomination
- [ ] Agent calls `userMemoryRecall` naturally (not forced)
- [ ] Tool returns only MemoryStore data (no Prisma fields)
- [ ] Doctrinal question counts increment after conversations
- [ ] Gospel presentation count increments after evangelistic conversations
- [ ] Learning preferences update based on user behavior

### Privacy Tests
- [ ] `userMemoryRecall` output contains NO spiritual status
- [ ] Agent responses NEVER mention spiritual status tracking
- [ ] Prisma Studio shows spiritual status populated (private)
- [ ] System prompt injection includes spiritual status (for agent)

### Performance Tests
- [ ] 1 Prisma query per conversation (not N queries)
- [ ] No forced memory recall at conversation start
- [ ] Memory extraction completes in <5 seconds
- [ ] Agent responses feel natural (context-aware without delay)

## 🔄 Migration Path (Already Complete)

### Changes Made
1. ✅ Fixed `preferredDepth` default to "concise" (not "moderate")
2. ✅ Added denomination selector to profile page with PATCH endpoint
3. ✅ Added `{PASTORAL_CONTEXT}` placeholder to system prompt
4. ✅ Implemented Prisma query + context injection in route.ts
5. ✅ Removed forced memory recall cache logic
6. ✅ Simplified `userMemoryRecall` tool (MemoryStore only)
7. ✅ Removed denomination from memory extraction metadata
8. ✅ Updated backfill script to skip denomination parameter

### Database State
- Migration `add_user_profile_memory_fields` already run
- All 11 new fields exist in `userProfile` table
- TypeScript types regenerated via `npx prisma generate`

## 📝 Maintenance Notes

### When to Update Denomination
- User changes preference in profile page → PATCH /api/user-profile
- Never via LLM extraction (removed from prompts)

### When to Update Structured Context
- Every conversation → `syncToPrisma()` updates spiritual status, doctrinal counts, ministry context, learning prefs
- Background process (non-blocking)

### When to Update Unstructured Memories
- Every conversation → `mergeMemories()` + `updateUserProfile()` to MemoryStore
- Includes theological interests, concerns, spiritual journey notes
 - Doctrinal question counts are maintained only in Prisma (`userProfile.core/secondary/tertiaryDoctrineQuestions`); not stored in MemoryStore

### When Agent Calls userMemoryRecall
- Naturally, when it needs specific details from prior conversations
- Not forced at conversation start
- Semantic search when query parameter provided
 - Defaults to a concise view (top interests, first concerns, recent journey notes); pass `full: true` to retrieve complete lists when needed

### Debug & Inspection Endpoint
- `GET /api/user-memory?userId=<id>` returns unstructured MemoryStore profile (secured per-user)
- `GET /api/user-memory?userId=<id>&action=search&query=<text>` performs semantic search across memories
- `DELETE /api/user-memory?userId=<id>` clears MemoryStore entries for that user (testing only)
  - Endpoint never exposes Prisma-only private fields (e.g., spiritualStatus)

### Extraction vs Conversation Models
- Extraction/Merge: `gpt-4.1-mini` (fast and cost-effective)
- Conversational Agent: `gpt-5-mini` (quality + streaming)

## 🚀 Future Enhancements

### Potential Additions
- Admin dashboard for aggregated ministry insights (anonymized)
- Scripture engagement tracking
- Conversation completion rates
- More granular learning preference dimensions
- Integration with prayer tracker for holistic discipleship view

---

## Quick Reference: Architecture at a Glance

| Data Type | Storage | Delivery | Update Frequency | Example |
|-----------|---------|----------|------------------|---------|
| Denomination | Prisma | System prompt injection | User-controlled (profile page) | "reformed-baptist" |
| Spiritual Status | Prisma | System prompt injection | Every conversation (LLM infers) | "new_believer" |
| Ministry Context | Prisma | System prompt injection | Every conversation (LLM infers) | ["parent", "pastor"] |
| Learning Prefs | Prisma | System prompt injection | Every conversation (LLM infers) | preferredDepth: "concise" |
| Doctrinal Counts | Prisma | System prompt injection | Every conversation (LLM increments) | core: 5, secondary: 8, tertiary: 2 |
| Theological Interests | MemoryStore (JSON) | userMemoryRecall tool | Every conversation (LLM merges) | "predestination" (count: 3) |
| Concerns | MemoryStore (JSON) | userMemoryRecall tool | Every conversation (LLM merges) | ["struggling with prayer"] |
| Spiritual Journey | MemoryStore (JSON) | userMemoryRecall tool | Every conversation (LLM merges) | ["recently converted", "growing in assurance"] |

---

**Architecture Benefits:**
- ✅ Fast context injection (1 Prisma query)
- ✅ Rich semantic search (MemoryStore for details)
- ✅ Clear separation (user prefs vs. inferred data)
- ✅ Privacy by design (status in prompt, not tool)
- ✅ Natural agent behavior (calls tool when needed)

