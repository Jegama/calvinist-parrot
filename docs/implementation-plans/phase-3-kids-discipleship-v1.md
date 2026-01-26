# Phase 3 – Kids Discipleship v1 (Heritage Journal)

**Source Documents:**
- [Roadmap for houshold, journal, and kids discipleship.md](../Roadmap%20for%20houshold,%20journal,%20and%20kids%20discipleship.md) — Master plan
- [Planning The Heritage Journal.md](../Planning%20The%20Heritage%20Journal.md) — UI sections and examples
- [Plan of Discipleship Framework.md](../Plan%20of%20Discipleship%20Framework.md) — Dr. Gifford's Four Elements and age brackets

**Feature Branding:**
- **Full name**: Heritage Journal
- **Tagline**: "Building faith with your children"
- **Nav label**: "Heritage" (in Header.tsx)
- **Route**: `/kids-discipleship`

## Objectives
- Deliver a unified Heritage Journal page at `/kids-discipleship` with tabs per child, shared by both parents in the household.
- Support Annual Plan (Four Elements), Monthly Vision, logs (Nurture/Admonition), and derived prayer focus lists.
- Reuse Journal entry pipeline for logs while keeping Prayer Tracker unchanged for now.

## Dependencies
- **Phase 1:** `birthdate` field on `prayerMember` and `utils/ageUtils.ts` for age/bracket calculation.
- **Phase 2:** `journalEntry` + `journalEntryAI` models, `JournalEntryType.DISCIPLESHIP` enum, `LogCategory` enum.

## Key Decisions (Resolved)

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| **Log category naming** | **Nurture & Admonition** | From Ephesians 6:4; frames both as *parental actions*, not child's state. "Admonition" = instruction/warning, not punishment |
| **`category` field location** | Column on `journalEntry` (not in metadata) | Enables direct SQL filtering for NURTURE/ADMONITION logs |
| **Route prefix** | `/api/kids-discipleship/*` (not `/api/household/*`) | Feature-specific routes; shared logic via `lib/householdService.ts` |
| **Age bracket calculation** | Use `utils/ageUtils.ts` from Phase 1 | Consistent age display across app |

## Age Brackets (display in UI)

| Bracket | Age Range | System Note |
|---------|-----------|-------------|
| Infant/Toddler | 0–3 years | "Focus on authority, atmosphere, simple habits. Heavy parental input, low child output." |
| Early Childhood | 3–6 years | "Begin introducing responsibility, simple obedience explanations." |
| Middle Childhood | 7–12 years | "Growing independence, more complex character work, academic competencies." |
| Adolescence | 13–17 years | "Preparing for adulthood, increased autonomy, deeper theological discussions." |

## Data Model Plan

### Reuse from Phase 2
- **`journalEntry`** with `entryType = DISCIPLESHIP` and `subjectMemberId = child.id`
- **`journalEntryAI`** stores Call 1/Call 2 outputs
- **`LogCategory`** enum (`NURTURE`, `ADMONITION`) already defined in Phase 2

### Log Category Naming (Ephesians 6:4)

| Category | UI Label | Meaning | Theological Basis |
|----------|----------|---------|-------------------|
| `NURTURE` | **Nurture** | Celebrating obedience, catching them doing good, blessing | Positive reinforcement of godly character |
| `ADMONITION` | **Admonition** | Correcting disobedience, redirecting the heart, training | Loving instruction that warns and guides (*nouthesia*) |

*"Bring them up in the nurture and admonition of the Lord."* — Ephesians 6:4 (KJV)

### New Enums (REQUIRED)

```prisma
enum CompetencyType {
  PROFESSIONAL  // Career/work skills
  PERSONAL      // Life/home skills
}
```

### New Tables (REQUIRED)

```prisma
model discipleshipAnnualPlan {
  id                  String         @id @default(cuid())
  memberId            String         // Child member (prayerMember.id)
  year                Int            // e.g., 2026
  
  // Four Elements
  characterGoal       String
  characterScripture  String?
  characterAction     String?
  
  competencyGoal      String
  competencyScripture String?
  competencyAction    String?
  competencyType      CompetencyType @default(PERSONAL)
  
  blessingsPlan       String?
  consequencesPlan    String?
  themeVerse          String?
  
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  // Relation
  member              prayerMember   @relation("ChildAnnualPlans", fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([memberId, year])
  @@index([memberId])
}

model discipleshipMonthlyVision {
  id              String       @id @default(cuid())
  memberId        String       // Child member (prayerMember.id)
  yearMonth       String       // Format: "YYYY-MM" (e.g., "2026-01")
  
  memoryVerse     String?
  characterFocus  String?
  competencyFocus String?
  emphasize       String?      // "What we will emphasize"
  watchFor        String?      // "What we will watch for"
  encourage       String?      // "How we will encourage" (blessings)
  correct         String?      // "How we will correct" (consequences)
  
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  // Relation
  member          prayerMember @relation("ChildMonthlyVisions", fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([memberId, yearMonth])
  @@index([memberId])
}
```

### Update prayerMember Model

Add relations to the member model:

```prisma
model prayerMember {
  // ... existing fields
  birthdate       DateTime?
  
  // New relations for Kids Discipleship
  annualPlans     discipleshipAnnualPlan[]    @relation("ChildAnnualPlans")
  monthlyVisions  discipleshipMonthlyVision[] @relation("ChildMonthlyVisions")
}
```

### Migration Command
```bash
npx prisma migrate dev --name add_kids_discipleship_tables
```

### Immutability Rules
- **Annual Plans:** Past years (year < current year) are read-only in UI; records are never deleted.
- **Monthly Visions:** Past months (yearMonth < current month) are read-only; records are never deleted.
- UI enforces read-only state; API rejects PATCH requests for past periods.

## Backend/API Plan
- **Child listing:** ensure `/api/household/members` returns `birthdate` and `isChild` boolean to build tabs. Compute `ageBracket` server-side or in UI helper.
- **Annual Plan routes:**
  - `/api/kids-discipleship/annual-plan` 
    - GET: returns all annual plans for all children in household, grouped by child
    - POST: create new plan for child/year (validate year not in past if editing)
    - PATCH `[id]`: update current year's plan (reject if year already passed)
  - History: GET returns all years for a child; UI shows past years as read-only cards
- **Monthly Vision routes:**
  - `/api/kids-discipleship/monthly-vision`
    - GET: returns current + past months for a child (query param: `memberId`, optional `yearMonth`)
    - POST: create/update vision for current month (upsert on unique constraint)
  - Past months are read-only; UI shows "History" tab with past visions
- **Logs routes:**
  - `/api/kids-discipleship/logs`
    - GET: list logs for a child with filters (date range, category NURTURE/ADMONITION)
    - POST: create log → creates `journalEntry` with `entryType=DISCIPLESHIP`, `subjectMemberId=child.id`, `category`; kicks off kids-specific AI calls
  - `/api/kids-discipleship/logs/[id]`: GET detail, PATCH for edits
- **Prayer focus derivation:** 
  - Server helper function `derivePrayerFocus(memberId, daysBack=30)` computes:
    - `prayerFocus[]`: items from ADMONITION logs (struggles needing prayer)
    - `praiseFocus[]`: items from NURTURE logs (wins to thank God for)
  - Returns with source entry IDs for linking; no persistence until Phase 4
- **Access control:** authorize via household membership; reuse `lib/householdService.ts`.

## Frontend Plan
- **New route:** `app/kids-discipleship/page.tsx` (client component) with React Query.
- **Header nav:** Add "Kids Discipleship" to Header.tsx nav items, linking to `/kids-discipleship`.
- **Layout:** 
  - Header shows household name
  - Tabs per child display: Name, age (calculated from DOB), bracket badge (e.g., "Infant/Toddler"), last log date chip, current annual character focus chip
- **Within a tab (6 sections from Planning The Heritage Journal.md):**

  **Section A: Annual Plan — The Four Elements**
  - Form with fields for all Four Elements (see Data Model)
  - Display current year's plan; "View History" expands to show past years (read-only cards)
  - Biblical basis text shown as helper/tooltip per element
  
  **Section B: Monthly Vision**
  - Form for current month with memory verse, character focus, competency focus, practice plan fields
  - "View History" shows past months as read-only
  - System auto-generates yearMonth label (e.g., "2026-01")
  
  **Section C: Nurture & Admonition Log**
  - Reuse Journal composer UI with:
    - Category toggle: "Nurture" (celebrating obedience) vs "Admonition" (correcting disobedience)
    - What happened (narrative)
    - Gospel connection input
    - Author auto-set to current user
  - Log list below with filters (date range, category)
  - Each log shows AI reflection card (parent shepherding guidance)
  
  **Section D: Prayer Focus (derived)**
  - Two lists: "Prayer Needs" (from Admonition logs), "Praises" (from Nurture logs)
  - Each item shows source log snippet; clicking opens full log
  - Buttons disabled for Phase 3 (promotion to Prayer Tracker in Phase 4)
  
  **Section E: Monthly Review Dashboard**
  - Wins vs struggles count chart (line or bar)
  - Top recurring heart issues (from AI tags)
  - Parent consistency tracking (optional boolean from logs)
  - Notes box: "What to adjust next month"
  
  **Section F: Annual Review (Date Night Mode)**
  - Triggered near year-end or child's birthday (show banner/prompt)
  - Assessment questions: growth in Character Goal? Competency Goal?
  - Bracket check: is child approaching new age bracket?
  - "Create Next Year's Plan" button → opens Annual Plan form for next year
  
- **State & caching:**
  - Query keys: `['kids-discipleship','members']`, `['kids-discipleship','annual-plan', memberId]`, `['kids-discipleship','monthly-vision', memberId, yearMonth]`, `['kids-discipleship','logs', memberId, filters]`, `['kids-discipleship','prayer-focus', memberId]`
  - Mutations invalidate relevant keys and household member list if birthdate edits occur
- **AI rendering:**
  - For each log, render Call 1 reflection card with parenting-specific fields
  - Call 2 tags shown as editable chips; suggested prayer requests shown but disabled until Phase 4

## Observability & Safety
- Maintain tone constraints in prompt templates; no AI-written prayers (per Master prompt.md).
- Surface `safetyFlags` from AI output for parents only (not shared with kids).
- Log model name/version in `journalEntryAI.modelInfo` for audit.

## LLM Prompt Templates

Store in `lib/prompts/kids-discipleship.ts`. Reference Master prompt.md for tone and doctrinal guardrails.

### Call 1: Parent Shepherding Reflection

**System prompt:**
```
You are a pastoral counselor helping Christian parents reflect on a parenting moment. Your role is to provide gentle, Scripture-rooted guidance without being preachy or condemning.

Context:
- Child's name: {{childName}}
- Child's age: {{childAge}} ({{ageBracket}} bracket)
- Current character focus: {{characterGoal}}
- Current competency focus: {{competencyGoal}}
- Log category: {{category}} (NURTURE = celebrating obedience, ADMONITION = correcting disobedience)

Age bracket guidance:
- Infant/Toddler (0-3): Heavy parental input, low child output. Focus on authority, atmosphere, simple habits.
- Early Childhood (3-6): Begin introducing responsibility, simple obedience explanations.
- Middle Childhood (7-12): Growing independence, more complex character work, academic competencies.
- Adolescence (13-17): Preparing for adulthood, increased autonomy, deeper theological discussions.

Guidelines:
- Be warm and encouraging; parenting is hard and grace-filled
- Suggest what might be going on in the child's heart with humility ("it could be...", "one possibility is...")
- Offer age-appropriate gospel connection ideas (how to point the child to Jesus)
- Keep suggestions practical and actionable
- Never write prayers for the parent to read aloud
- Remember: "God gave the growth" (1 Corinthians 3:6)
```

**User message:**
```
A parent logged this moment with their child:

Category: {{category}}
What happened: {{entryText}}
Gospel connection (if provided): {{gospelConnection}}

Provide reflection to help the parent shepherd their child's heart.
```

**Output schema (JSON):**
```json
{
  "summary": "string",
  "whatMightBeGoingOnInTheHeart": ["string"],
  "gospelConnectionSuggestion": {
    "ageAppropriatePhrase": "string",
    "scriptureToShare": "string",
    "explanation": "string"
  },
  "parentShepherdingNextSteps": ["string"],
  "scripture": [{ "reference": "string", "whyItApplies": "string" }],
  "encouragementForParent": "string",
  "safetyFlags": ["string"]
}
```

### Call 2: Tags + Child Prayer Suggestions

**System prompt:**
```
You are analyzing a parenting log entry to extract structured tags and suggest prayer requests for the child. Do NOT write prayers; suggest what the parents might want to pray about for their child.

Tag categories (use these exact category names):
- Circumstance: Parenting, Sibling conflict, School, Sleep, Mealtime, Church, Friendship, Health, Discipline moment, Teaching moment
- HeartIssue: Defiance, Fear, Anxiety, Selfishness, Anger, Impatience, Dishonesty, Laziness, Jealousy, Pride
- Virtue: Obedience, Patience, Gentleness, Self-control, Kindness, Honesty, Diligence, Courage, Contentment, Generosity
- DevelopmentalArea: Authority acceptance, Emotional regulation, Social skills, Motor skills, Communication, Independence, Responsibility
```

**User message:**
```
Analyze this parenting log:

Child: {{childName}} ({{childAge}}, {{ageBracket}})
Category: {{category}}
What happened: {{entryText}}
Reflection summary: {{call1Summary}}

Extract tags and suggest prayer requests for this child.
```

**Output schema (JSON):**
```json
{
  "tags": {
    "circumstance": ["string"],
    "heartIssue": ["string"],
    "virtue": ["string"],
    "developmentalArea": ["string"]
  },
  "suggestedChildPrayerRequests": [
    { "text": "string", "linkedScripture": "string|null" }
  ],
  "suggestedMonthlyVisionAdjustments": ["string"],
  "parentConsistencyNote": "string|null"
}
```

## QA & Acceptance Criteria
1. **Annual Plan:**
   - Both parents can create/view annual plans for each child
   - Past years are read-only (cannot edit 2025 plan in 2026)
   - All Four Elements fields save correctly
2. **Monthly Vision:**
   - Current month's vision is editable
   - Past months are read-only and visible in history
   - Unique constraint prevents duplicate yearMonth per child
3. **Logs:**
   - Log creation with category (NURTURE/ADMONITION) works
   - Logs trigger AI Call 1 and Call 2
   - AI reflection shows parenting-specific guidance
   - Gospel connection field is optional but encouraged
4. **Prayer Focus:**
   - Derived correctly from recent logs (last 30 days)
   - Shows source log for each item
   - Promotion buttons are disabled (Phase 4)
5. **Rotation APIs:**
   - Existing rotation logic ignores DISCIPLESHIP entries
   - Prayer Tracker remains unaffected
6. **UI:**
   - Bracket badge displays correctly based on age
   - Tab shows child name, age, bracket, last log date
   - Snapshot tests for tab layout and cards

## Deliverables Checklist

| Deliverable | Type | Path |
|-------------|------|------|
| Kids tables migration | Schema | `prisma/schema.prisma` |
| Kids prompts | New file | `lib/prompts/kids-discipleship.ts` |
| Kids AI pipeline | New file | `utils/kids-discipleship/llm.ts` |
| Annual plan routes | New file | `app/api/kids-discipleship/annual-plan/route.ts` |
| Monthly vision routes | New file | `app/api/kids-discipleship/monthly-vision/route.ts` |
| Logs routes | New file | `app/api/kids-discipleship/logs/route.ts` |
| Log detail route | New file | `app/api/kids-discipleship/logs/[id]/route.ts` |
| Prayer focus helper | New file | `utils/kids-discipleship/prayerFocus.ts` |
| Kids page | New file | `app/kids-discipleship/page.tsx` |
| Child tab component | New file | `app/kids-discipleship/components/ChildTab.tsx` |
| Annual plan form | New file | `app/kids-discipleship/components/AnnualPlanForm.tsx` |
| Monthly vision form | New file | `app/kids-discipleship/components/MonthlyVisionForm.tsx` |
| Log composer | New file | `app/kids-discipleship/components/LogComposer.tsx` |
| Header nav update | Edit | `components/Header.tsx` |
