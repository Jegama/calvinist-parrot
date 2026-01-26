# Phase 2 – Journal v1 (Personal Journal)

**Source Documents:**
- [Roadmap for houshold, journal, and kids discipleship.md](../Roadmap%20for%20houshold,%20journal,%20and%20kids%20discipleship.md) — Master plan with LLM architecture and dashboard specs

## Objectives
- Launch personal journaling at `/journal` with immediate structured reflection (Call 1) and tag/prayer suggestions (Call 2).
- Support Continue-in-Chat handoff mirroring Parrot QA behavior.
- Provide filters, search, and lightweight dashboard metrics.
- **Header nav:** Add "Journal" to Header.tsx nav items, linking to `/journal`.

## Key Decisions (Resolved)

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| **Legacy `prayerJournalEntry` migration** | Keep read-only; do NOT backfill | Avoids data migration risk; legacy table can be sunset in future version |
| **Historical summaries for Call 1** | Feed last 3 entry summaries | Provides context without excessive token usage |
| **Field naming** | Use `spaceId` (not `householdId`) to match existing schema | Consistency with Phase 1 decision |
| **`subjectMemberId` indexing** | Add index for query performance | Used by Kids Discipleship logs (Phase 3) |
| **`category` field for logs** | Add as enum column on `journalEntry` | Queryable for SPIRIT/FLESH filtering in Phase 3 |

## Current State (key references)
- Legacy journal model and route at [app/api/prayer-tracker/journal/route.ts](app/api/prayer-tracker/journal/route.ts) tied to `prayerJournalEntry` in [prisma/schema.prisma](prisma/schema.prisma).
- Prayer tracker space/membership patterns: [app/api/prayer-tracker/spaces/route.ts](app/api/prayer-tracker/spaces/route.ts), helper API client [app/prayer-tracker/api.ts](app/prayer-tracker/api.ts).
- Chat infra for seeding new threads: chat tables in [prisma/schema.prisma](prisma/schema.prisma); chat UI/pages at [app/page.tsx](app/page.tsx) and [app/[chatId]/page.tsx](app/[chatId]/page.tsx) with list invalidation patterns using `hooks/use-chat-list.ts`.

## Data Model Plan

### New Enums (REQUIRED)

```prisma
enum JournalEntryType {
  PERSONAL      // Personal journal entry
  DISCIPLESHIP  // Kids discipleship log (Phase 3)
}

enum LogCategory {
  SPIRIT  // "Sowing to Spirit" - blessings/wins (Phase 3)
  FLESH   // "Sowing to Flesh" - struggles/consequences (Phase 3)
}
```

### New Tables (REQUIRED)

```prisma
model journalEntry {
  id                String            @id @default(cuid())
  spaceId           String?           // Links to prayerFamilySpace (household)
  authorProfileId   String            // Links to userProfile.id
  entryDate         DateTime          @default(now())
  entryText         String
  entryType         JournalEntryType  @default(PERSONAL)
  category          LogCategory?      // Only used for DISCIPLESHIP entries (Phase 3)
  subjectMemberId   String?           // Child member ID for DISCIPLESHIP entries
  tags              String[]          // Flat array for quick filtering
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  // Relations
  space             prayerFamilySpace? @relation(fields: [spaceId], references: [id])
  aiOutput          journalEntryAI?

  @@index([spaceId])
  @@index([authorProfileId])
  @@index([subjectMemberId])  // Important for Phase 3 child log queries
  @@index([entryType])
}

model journalEntryAI {
  id        String       @id @default(cuid())
  entryId   String       @unique
  call1     Json         // Pastoral Reflection output
  call2     Json?        // Tags + Prayer Suggestions output (nullable until processed)
  modelInfo Json         // { model: string, version: string, promptVersion: string }
  createdAt DateTime     @default(now())

  // Relations
  entry     journalEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
}
```

### Migration Notes
1. **New tables only** — do not modify `prayerJournalEntry`.
2. **Add relation** to `prayerFamilySpace` model:
   ```prisma
   model prayerFamilySpace {
     // ... existing fields
     journalEntries journalEntry[]
   }
   ```
3. **Increment counter** — update `userProfile.journalEntriesCount` on entry creation.
4. **Migration command:**
   ```bash
   npx prisma migrate dev --name add_journal_tables
   ```

## Backend/API Plan

### Shared Services
- **Reuse `lib/householdService.ts`** from Phase 1 for membership resolution.
- **Create `utils/journal/llm.ts`** for AI pipeline functions.

### Journal Routes (App Router)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/journal/entries` | GET | List entries with filters (date range, tags, text search, pagination) |
| `/api/journal/entries` | POST | Create entry + kick off AI jobs |
| `/api/journal/entries/[id]` | GET | Entry detail including AI outputs |
| `/api/journal/entries/[id]` | PATCH | Update tags/title |
| `/api/journal/entries/[id]/continue-chat` | POST | Create seeded chat thread, return `chatId` |

### Continue-in-Chat Implementation

Follow the pattern from [app/api/parrot-chat/route.ts#L47-L72](../../app/api/parrot-chat/route.ts):

```typescript
// POST /api/journal/entries/[id]/continue-chat
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { userId } = await request.json();
  
  // 1. Fetch entry + AI output
  const entry = await prisma.journalEntry.findUnique({
    where: { id: params.id },
    include: { aiOutput: true },
  });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  
  // 2. Format reflection for assistant message
  const reflectionText = formatCall1ForChat(entry.aiOutput?.call1);
  
  // 3. Create chat with seeded messages
  const conversationName = await generateConversationName(entry.entryText);
  const chat = await prisma.$transaction(async (tx) => {
    const createdChat = await tx.chatHistory.create({
      data: {
        userId,
        conversationName,
        category: "journal",
        subcategory: "reflection",
        issue_type: "personal",
      },
    });
    await tx.chatMessage.createMany({
      data: [
        { chatId: createdChat.id, sender: "user", content: entry.entryText },
        { chatId: createdChat.id, sender: "parrot", content: reflectionText },
      ],
    });
    return createdChat;
  });
  
  return NextResponse.json({ chatId: chat.id });
}
```

### AI Pipeline (`utils/journal/llm.ts`)

```typescript
// utils/journal/llm.ts

export async function runPastoralReflection(input: {
  entryText: string;
  authorProfileId: string;
  spaceId: string | null;
  preferredDepth: "concise" | "moderate" | "detailed";
  recentSummaries?: string[]; // Last 3 entry summaries
}): Promise<Call1Output> {
  // Use structured output with JSON schema
  // Store in journalEntryAI.call1
}

export async function runTagsAndSuggestions(input: {
  entryText: string;
  call1Summary: string;
}): Promise<Call2Output> {
  // Extract tags and prayer suggestions
  // Store in journalEntryAI.call2
}
```

### Prayer Suggestion Integration
- `suggestedPrayerRequests` from Call 2 creates payloads for `/api/prayer-tracker/requests`.
- Keep creation optional/explicit via client POST.
- Use existing `appendUserId` pattern from Prayer Tracker.

## Frontend Plan
- **Pages and layout:**
  - New route `app/journal/page.tsx` using React Query v5; provider already in `AppProviders`.
  - Components: Entry composer (textarea + optional guide text), ReflectionCard (renders Call 1), SuggestedRequests panel (Call 2), EntriesList with filters (date range, tag chips, search input), Dashboard strip (entries this week/month, last entry, top tags).
  - Reuse shadcn primitives; keep branding via semantic Tailwind tokens (primary/accent/user-message/background).
- **State & caching:**
  - Query keys: `['journal','entries', householdId, filters]`, `['journal','entry', id]`.
  - Mutations: create entry triggers optimistic insertion and kicks off two AI fetches; on completion update cache.
  - When user accepts a suggested request, call `/api/prayer-tracker/requests` then invalidate `['prayer-requests', householdId]` (matching `use-prayer-space` query key naming).
- **Continue in Chat:**
  - Button on ReflectionCard hits `continue-chat` endpoint; upon success route to `/[chatId]` and invalidate chat list using `use-chat-list` patterns.
- **Typed tags UI:**
  - Display typed tags from Call 2; allow free-form edits stored in `journalEntry.tags` for now; persist typed object inside `journalEntryAI.call2`.

## Observability & Safety
- Log model name/version in `journalEntryAI.modelInfo` for audit.
- Add guardrails to avoid AI-written prayers (per PRD) and keep tone pastoral; enforce via prompt templates stored in `lib/prompts`.
- Handle missing `preferredDepth` with default `concise`.

## LLM Prompt Templates

Store in `lib/prompts/journal.ts`. Reference Master prompt.md for tone and doctrinal guardrails.

### Call 1: Pastoral Reflection

**System prompt:**
```
You are a pastoral counselor helping a believer reflect on their life before God (Coram Deo). Your role is to provide gentle, Scripture-rooted reflection without writing prayers for them to read aloud.

Guidelines:
- Be warm, patient, and hopeful like a shepherd (Psalm 23; Hebrews 4:14-16)
- Ground all insights in Scripture with full book names (e.g., "1 Corinthians" not "1 Cor")
- Use "put off / put on" language from Ephesians 4:22-24 where appropriate
- Never write prayers for the user to read; instead suggest what they might pray about
- Be cautious and gentle when suggesting heart issues; use phrases like "it might be worth considering" rather than definitive diagnoses
- Keep response readable in 30-60 seconds unless user prefers detailed responses
- If safety concerns arise (self-harm, abuse, medical emergency), flag immediately and direct to appropriate resources

Response depth: {{preferredDepth}} (concise | moderate | detailed)
```

**User message:**
```
Please reflect on this journal entry:

---
{{entryText}}
---

Provide a structured reflection with:
1. A short title (3-7 words)
2. One-sentence summary
3. Situation summary (2-4 sentences)
4. Heart reflection (what might be going on beneath the surface)
5. "Put off" patterns to consider
6. "Put on" virtues to cultivate
7. Scripture references with brief explanation of why each applies
8. 1-3 practical next steps
```

**Output schema (JSON):**
```json
{
  "title": "string",
  "oneSentenceSummary": "string",
  "situationSummary": "string",
  "heartReflection": ["string"],
  "putOff": ["string"],
  "putOn": ["string"],
  "scripture": [{ "reference": "string", "whyItApplies": "string" }],
  "practicalNextSteps": ["string"],
  "safetyFlags": ["string"] // internal, for escalation routing
}
```

### Call 2: Tags + Prayer Suggestions

**System prompt:**
```
You are analyzing a journal entry to extract structured tags and suggest prayer requests. Do NOT write prayers; suggest what the user might want to pray about.

Tag categories (use these exact category names):
- Circumstance: Work, Marriage, Parenting, Church, Friendship, Health, Finances, Suffering, Conflict, Temptation, Decision, Rest, Time stewardship
- HeartIssue: Anger, Fear, Anxiety, Pride, People-pleasing, Control, Bitterness, Envy, Lust, Sloth, Self-righteousness, Unbelief, Despair, Shame
- RulingDesire: Comfort, Approval, Power, Control, Security, Success, Ease, Reputation
- Virtue: Patience, Gentleness, Courage, Humility, Contentment, Gratitude, Self-control, Love, Honesty, Diligence, Hope
- TheologicalTheme: Sovereignty, Providence, Sanctification, Justification, Union with Christ, Repentance, Faith, Adoption, Perseverance, Wisdom, Suffering, Forgiveness, Reconciliation
- MeansOfGrace: Scripture, Prayer, Lord's Day, Fellowship, Accountability, Confession, Service
```

**User message:**
```
Analyze this journal entry and its reflection:

Entry:
{{entryText}}

Reflection summary:
{{call1Summary}}

Extract tags and suggest prayer requests the user might want to add to their prayer list.
```

**Output schema (JSON):**
```json
{
  "tags": {
    "circumstance": ["string"],
    "heartIssue": ["string"],
    "rulingDesire": ["string"],
    "virtue": ["string"],
    "theologicalTheme": ["string"],
    "meansOfGrace": ["string"]
  },
  "scriptureReferences": [{ "book": "string", "chapter": "number", "verseStart": "number", "verseEnd": "number|null", "display": "string" }],
  "suggestedPrayerRequests": {
    "personal": [{ "text": "string", "linkedScripture": "string|null" }],
    "household": [{ "text": "string", "linkedScripture": "string|null" }]
  },
  "searchKeywords": ["string"],
  "dashboardSignals": { "recurringTheme": "string|null" }
}
```

## Migration & QA

### Migration Steps
1. Run `npx prisma migrate dev --name add_journal_tables` to create journal tables and enums.
2. Update `prayerFamilySpace` model to include `journalEntries` relation.
3. Regenerate client.

### Testing Checklist
- [ ] Entry creation works with and without spaceId
- [ ] AI Call 1 generates structured reflection
- [ ] AI Call 2 generates tags and prayer suggestions
- [ ] Continue-in-Chat creates seeded thread correctly
- [ ] Chat list invalidates after continue-in-chat
- [ ] Prayer suggestion "Add" creates request in Prayer Tracker
- [ ] Entry list filters by date, tags, text search
- [ ] Dashboard metrics calculate correctly
- [ ] Legacy `prayerJournalEntry` remains accessible (read-only)

## Deliverables Checklist

| Deliverable | Type | Path |
|-------------|------|------|
| Journal tables migration | Schema | `prisma/schema.prisma` |
| Journal prompts | New file | `lib/prompts/journal.ts` |
| AI pipeline | New file | `utils/journal/llm.ts` |
| Entries route | New file | `app/api/journal/entries/route.ts` |
| Entry detail route | New file | `app/api/journal/entries/[id]/route.ts` |
| Continue-chat route | New file | `app/api/journal/entries/[id]/continue-chat/route.ts` |
| Journal page | New file | `app/journal/page.tsx` |
| ReflectionCard component | New file | `app/journal/components/ReflectionCard.tsx` |
| Header nav update | Edit | `components/Header.tsx` |

## Resolved Questions

| Question | Resolution |
|----------|------------|
| Backfill legacy `prayerJournalEntry`? | **No** — keep read-only until sunset |
| Historical summaries for Call 1? | **Last 3 entries** — balance context vs token usage |
