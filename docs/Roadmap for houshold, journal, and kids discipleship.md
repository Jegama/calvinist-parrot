# Calvinist Parrot Roadmap, Household, Journal, Kids Discipleship, Prayer Integration

This document merges your preferences, your existing Prayer Tracker architecture, your Heritage Journal plan, and the best parts of the “Coram Deo Journal” proposal into one cohesive implementation plan with four phases.

## Product goals and principles

**Primary goal:** build a household-centered ecosystem that helps individuals and parents apply Scripture wisely to daily life, track growth over time, and turn reflection into concrete prayer and shepherding action.

**Source Documents:**
- [Planning The Heritage Journal.md](Planning%20The%20Heritage%20Journal.md) — Kids discipleship one-pager with UI sections and examples
- [Plan of Discipleship Framework.md](Plan%20of%20Discipleship%20Framework.md) — Dr. Gifford's Four Elements framework and age brackets
- [updated app feature.md](updated%20app%20feature.md) — Updated feature spec with Nurture & Admonition language

**Naming Decisions:**

| Feature | Nav Label (Header.tsx) | Route | Full Name (marketing/docs) |
|---------|------------------------|-------|----------------------------|
| Personal Journal | **Journal** | `/journal` | Coram Deo Journal |
| Kids Discipleship | **Kids Discipleship** | `/kids-discipleship` | Heritage Builder |

*Rationale:* Simple nav labels follow existing patterns (Chat, Devotional, Prayer Tracker). Fuller names appear on feature landing pages and align with theological frame ("Coram Deo" = living before the face of God; "Heritage" = Psalm 127:3).

**Guiding principles (aligned with your design system):**

* **Faithfulness:** Scripture-rooted counsel, clear categories, no gimmicks.
* **Freedom:** simple, generous UX, no paywalls, low friction.
* **Fellowship:** household collaboration, shared stewardship, respectful tone.
* **Futurism:** modern, structured data, dashboards that actually help.
  (See Design System principles and palette usage for UI consistency.)

**Theological frame (lightweight, not preachy):**

* “Coram Deo”, living before the face of God.
* “Put off, put on”, Ephesians 4:22-24; Ephesians 4:31-32.
* Growth is real and God-given, 1 Corinthians 3:6.

---

# Key Implementation Decisions (Resolved)

These decisions were finalized during the codebase audit to ensure alignment with existing patterns.

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| **Model renaming with `@@map`** | **Skip** — keep original names (`prayerFamilySpace`, `prayerMember`) | Avoids code churn; existing patterns work well |
| **`spaceId` vs `householdId`** | Use **`spaceId`** everywhere | Consistency with existing schema; `spaceId` = household ID |
| **Legacy `prayerJournalEntry` migration** | **Keep read-only**, no backfill | Avoids data migration risk; sunset in future version |
| **Historical summaries for AI Call 1** | **Last 3 entries** | Balances context vs token usage |
| **`category` field for logs** | **Add as column** on `journalEntry` | Enables direct SQL filtering for NURTURE/ADMONITION |
| **Route structure** | Feature-specific routes (`/api/journal/*`, `/api/kids-discipleship/*`) | Clear separation; shared logic via `lib/householdService.ts` |
| **Cross-link deletion behavior** | **`onDelete: SetNull`** on `linkedJournalEntryId` | Prevents blocking deletions; requests preserve text |

---

# Shared foundation across all phases

## 1 Unify the container concept: Household

You already have `prayerFamilySpace` functioning as a household container. Phase 1 generalizes this concept without breaking Prayer Tracker.

### Decided approach (minimal migration, stable naming)

* **Keep existing model names** (`prayerFamilySpace`, `prayerMember`, etc.) — do NOT use `@@map` renaming.
* Use `spaceId` consistently across all new tables to reference the household.
* Create `lib/householdService.ts` to encapsulate membership lookup and access control, reused by Prayer Tracker, Journal, and Kids APIs.

## 2 Shared identity model changes you want

### Add birthdate for age calculation

Add a `birthdate` field to `prayerMember`. This supports:

* Auto age calculation in the UI for kids tabs
* Less manual updating over time

Required field:

* `birthdate DateTime?`

Age calculation utility at `utils/ageUtils.ts` provides:
* `calculateAge(birthdate)` → `{ years, months }`
* `getAgeBracket(birthdate)` → `'INFANT_TODDLER' | 'EARLY_CHILDHOOD' | 'MIDDLE_CHILDHOOD' | 'ADOLESCENCE'`
* `formatAge(birthdate)` → `"7 months"`, `"2 years"`

## 3 Shared entry primitive: Generalized Journal Entry

Create a new `journalEntry` table (do NOT modify `prayerJournalEntry`). This supports:

* Personal journal entries (`entryType = PERSONAL`)
* Kids discipleship logs (`entryType = DISCIPLESHIP`, `subjectMemberId` = child ID, `category` = SPIRIT/FLESH)

The `journalEntryAI` table stores structured AI outputs (Call 1 + Call 2) as JSON for rapid iteration.

This is the single biggest reuse lever across Journal, Kids, and Prayer integration.

---

# Tagging and intelligence layer (merged and comprehensive)

You asked for a merged taxonomy that includes the best of both plans.

## Tag categories (typed tags, not one flat bucket)

Even if you store tags as `String[]` initially, treat them as typed in the LLM outputs.

1. **Circumstance**

* Work, Marriage, Parenting, Church, Friendship, Health, Finances, Suffering, Conflict, Temptation, Decision, Rest, Time stewardship

2. **Heart issue**

* Anger, Fear, Anxiety, Pride, People-pleasing, Control, Bitterness, Envy, Lust, Sloth, Self-righteousness, Unbelief, Despair, Shame, Hardened conscience

3. **Ruling desire / idol patterns** (use careful language)

* Comfort, Approval, Power, Control, Security, Success, Ease, Reputation

4. **Theological theme**

* Sovereignty, Providence, Sanctification, Justification, Union with Christ, Repentance, Faith, Adoption, Perseverance, Wisdom, Suffering, Forgiveness, Reconciliation, Prayer, Word, Church

5. **Virtue / Put-on**

* Patience, Gentleness, Courage, Humility, Contentment, Gratitude, Self-control, Love, Honesty, Diligence, Hope

6. **Means of grace**

* Scripture, Prayer, Lord’s Day, Fellowship, Accountability, Confession, Service

7. **Scripture references** (structured)

* Store as a list of `{ book, chapter, verseStart, verseEnd? }` plus a display string.

8. **Audience / subject scope**

* Self, Spouse, Child, Household, Neighbor, Church member, Workplace

This tag system powers dashboards, search, and household trend detection later.

---

# LLM architecture that matches your preferences

You want:

* Structured output for saving
* No AI-written prayers to read aloud
* Second LLM call suggesting prayer requests to add
* Continue in Chat receives full context, no privacy prompts
* No follow-up questions, no guided “next entry” prompts beyond your normal journaling guide text

## Call 1, “Pastoral Reflection” (structured, saved)

Triggered immediately on entry submit.

**Inputs**

* Entry text
* Minimal metadata: author profile id, household id (if any), subject (self or child)
* Optional: last N entry summaries and top tags (for context)
* Preferred depth from `userProfile.preferredDepth`

**Outputs (example JSON shape)**

* `title`
* `oneSentenceSummary`
* `situationSummary` (2 to 4 sentences)
* `heartReflection` (bullets, gentle and cautious)
* `putOff` (bullets)
* `putOn` (bullets)
* `scripture` (array of references with “why this applies”)
* `practicalNextSteps` (1 to 3)
* `toneNotes` (internal, for formatting)
* `safetyFlags` (internal, for escalation routing)
* `modelInfo` (model name, version, promptVersion)

**UI rendering**

* A “Reflection” card under the entry, readable in 30 to 60 seconds.
* Buttons:

  * **Continue in Chat**
  * **New Entry** (blank entry with your standard guide text)

## Call 2, “Tags + Prayer Suggestions” (structured, saved)

Triggered in parallel while the user reads Call 1 output.

**Outputs**

* `tags` (typed categories listed above)
* `suggestedPrayerRequests` (what to add, not prayers to read)

  * `personalRequests[]` (for `prayerPersonalRequest`)
  * `familyRequests[]` (optionally linked to a specific `prayerFamily` or to household rotation, depending on your model)
  * `childRequests[]` (tagged to a child member, for Phase 4 promotion)
* `searchKeywords` (optional)
* `dashboardSignals` (for later, for example “recurring anxiety theme”)

**UI rendering**

* Tags appear as chips, editable.
* A “Suggested prayer requests” panel with “Add” buttons that create the request objects in the Prayer Tracker.

## Continue in Chat behavior (Parrot QA pattern)

When the user clicks **Continue in Chat**:

* Create a new `chatHistory` thread
* Seed it with:

  1. User message, the original entry text
  2. Assistant message, the formatted “Pastoral Reflection” content (and optionally tag summary as a hidden tool context, but the chat should have everything it needs)

That is it. No extra questions, no privacy gating, no additional templated prompts.

---

# Journal dashboards (ideas that are actually useful)

You asked to ideate a dashboard for the journal. Here is a v1 that stays simple and queryable, plus a v2 that becomes richer as tags and history grow.

## Journal Dashboard v1 (Phase 2)

**Top row**

* Entries this week, entries this month
* Last entry date
* Most common heart issue tag this month
* Most common circumstance tag this month

**Main**

* **Entries list** with filters: date range, tag chips, text search
* **Tag cloud** (top 10 tags, clickable)
* **Scripture index** (top passages referenced, clickable)

**Secondary**

* “Suggested prayer requests added” count (from Call 2 accepts)
* “Most used put-on virtues” (from Call 1 output)

## Journal Dashboard v2 (Phase 4 or later)

* “Heart heatmap” by week (heart issue x week count)
* Recurrence detection, “This theme has shown up 4 times in 3 weeks”
* Household trends, “Parents both journaling about fatigue and irritability”
* Correlation views, “Work stress entries rise, family conflict rises”
  Keep this behind a “Trends” tab so the main dashboard stays gentle.

---

# Kids discipleship tracker design, unified page, tabs per child

You want:

* Shared by household, both husband and wife can add and view
* No separate pages per child, one unified page with child tabs
* Annual plan with the Four Elements of Discipleship (from Dr. Gifford)
* Monthly vision for focus and drift prevention
* LLM feedback for parents, structured and helpful
* **Historical tracking of goals** (annual and monthly plans are immutable records, not overwritten)

## Age Brackets (from Dr. Gifford's framework)

The Four Elements must be customized based on the child's developmental stage. System calculates age from birthdate and displays the current bracket:

| Bracket | Age Range | Characteristics |
|---------|-----------|-----------------|
| Infant/Toddler | 0–3 years | Heavy parental input, low child output. Focus on authority, atmosphere, simple habits. |
| Early Childhood | 3–6 years | Begin introducing responsibility, simple obedience explanations. |
| Middle Childhood | 7–12 years | Growing independence, more complex character work, academic competencies. |
| Adolescence | 13–17 years | Preparing for adulthood, increased autonomy, deeper theological discussions. |

## Kids Discipleship page layout

**Header**

* Household name
* Child tabs, each tab shows: Name, age (calculated from DOB), current bracket badge, quick status chips (current annual focus, last log date)

**Within each child tab**

### Section A, Annual Plan — The Four Elements (versioned by year)

Based on Dr. Gifford's "Plan of Discipleship" framework. Each annual plan is stored as an **immutable historical record** keyed by year—creating a new year's plan does not overwrite the previous one.

**1. Character Focus (Christ-likeness)**
* Goal: [User Entry, e.g., "Submission"]
* Scripture Tag: [e.g., Ephesians 6:1]
* Observable Action: [e.g., "Responding to 'No' without whining"]
* Biblical Basis: 2 Peter 1:5-7

**2. Competency Focus (Life Skills)**
* Goal: [User Entry, e.g., "Sleep Schedule / Gentle Hands"]
* Scripture Tag: [e.g., 1 Corinthians 14:40]
* Observable Action: [e.g., "Sleeping in own crib; not grabbing glasses"]
* Type: [Professional / Personal]
* Biblical Basis: 2 Thessalonians 3:10-12; 1 Thessalonians 4:11

**3. Blessings (The Harvest of Obedience)**
* Plan: [User Entry, e.g., "Clapping, Puffs, Park Time"]
* Prompt: "How will we celebrate obedience?"
* Types: Practical / Spiritual
* Biblical Basis: Ephesians 6:2-3

**4. Consequences (The Harvest of Disobedience)**
* Plan: [User Entry, e.g., "Firm 'No', Redirection, Playpen Time"]
* Prompt: "What is the immediate, age-appropriate response to rebellion?"
* Note: Must be age-bracket appropriate
* Biblical Basis: Galatians 6:7; Proverbs 22:15

**Theme Verse for the Year:** [Optional]

### Section B, Monthly Vision (versioned by year-month)

Each monthly vision is stored as an **immutable historical record** keyed by year-month—past months become read-only and visible in history.

Suggested fields:

* Year-Month label (auto-generated, e.g., "2026-01")
* Memory verse for the month (optional)
* Monthly focus, pick one or both:

  * Character focus: Which aspect of the annual character goal are we emphasizing?
  * Competency focus: Which specific skill or habit are we practicing?
* Household practice plan:

  * "What we will emphasize"
  * "What we will watch for"
  * "How we will encourage" (specific blessings)
  * "How we will correct" (specific consequences)

### Section C, The "Nurture & Admonition" Log (reuse Journal Entry UI)

*From Ephesians 6:4: "Bring them up in the nurture and admonition of the Lord." Both terms describe parental actions, not the child's state.*

* **Nurture:** Record times you caught them doing good and how you blessed them.
  * *Example:* "Edmund reached for the outlet, I said No, and he pulled back! We clapped and read a book."
* **Admonition:** Record times correction was needed and how you shepherded their heart.
  * *Example:* "Threw food on the floor. Mealtime ended immediately. Explained that food is a gift from God."

Fields per log:

* Category (Nurture or Admonition)
* What happened (short narrative)
* Gospel connection (how you pointed to Christ)
* Parent consistency check (optional boolean)
* Tags (circumstance, heart, virtue, theme)
* Author (which parent logged it)

### Section D, Prayer focus (derived from logs in Kids v1)

* List of current “prayer focus” items from recent struggles
* List of “praise focus” items from wins
* Each item can later be promoted to Prayer Tracker requests in Phase 4

### Section E, Monthly Review dashboard (per child)

* Wins vs struggles count over time
* Top recurring heart issues
* Parent consistency, if tracked
* Simple notes box, “What to adjust next month”
### Section F, Annual Review (Date Night Mode)

Prompted annually (e.g., on January 1st or child's birthday):

* **Assessment:** Did we see growth in [Character Goal]? [Competency Goal]?
* **Bracket Check:** Is the child approaching a new age bracket? Do we need to adjust our approach?
* **Plan Forward:** Create next year's Four Elements plan (old year becomes read-only history)
* **Prayer Prompt:** Option to generate a prayer focus for the child for the coming year
## LLM feedback for parents (Kids logs)

This is a separate structured reflection tuned for parenting tone.

**Call 1 output fields (kids)**

* `summary`
* `whatMightBeGoingOnInTheHeart` (gentle possibilities)
* `gospelConnectionSuggestion` (age-appropriate phrasing ideas, not a prayer)
* `parentShepherdingNextSteps` (1 to 3)
* `scripture` references with “why”
* `suggestedPrayerRequests` is not here, it belongs to Call 2

**Call 2 output fields (kids)**

* Tags
* Suggested prayer requests to add for the child
* Suggested “monthly vision adjustments” (optional future enhancement)

---

# Four-phase implementation plan

## Phase 1: Generalize Prayer Space into a reusable Household layer

### Scope

* Treat `prayerFamilySpace` as the household hub for the whole app.
* Add `birthdate` to members for automatic age.
* Prepare schema for generalized journal entries without breaking Prayer Tracker.

### Deliverables

1. **Household naming and code aliasing**

* Rename models in Prisma using `@@map` so your code uses `HouseholdSpace`, `HouseholdMember`, etc, while DB stays stable.

2. **Member birthdate**

* Add `birthdate DateTime?` to member model
* Update member create and edit UI

3. **Foundational APIs**

* Normalize route naming internally, even if endpoints remain the same initially:

  * `/api/household`
  * `/api/household/members`
  * Keep Prayer Tracker endpoints working, but start consuming the household abstraction in shared hooks.

### Acceptance criteria

* Prayer Tracker works exactly as it does now
* Household can be referenced by other modules
* Birthdate is stored and age is computed in UI

---

## Phase 2: Ship Journal v1 (Coram Deo Journal)

### Scope

* Personal journaling at `/journal` with immediate reflection
* Structured tags and dashboards
* Continue in Chat pattern exactly like Parrot QA
* Second call suggests prayer requests to add to Prayer Tracker

### UI deliverables

1. Journal Home

* New entry
* Entry list with filters and search
* Tag chips and scripture index

2. New Entry

* Free text editor
* Optional ACBC-style guide text visible in the UI, but no forced prompts

3. Reflection card

* Renders structured Call 1 output
* Buttons: Continue in Chat, New Entry

4. Suggested prayer requests panel

* From Call 2
* “Add” buttons create `prayerPersonalRequest` records, optionally with linked Scripture

### Data model adjustments

Replace or evolve `prayerJournalEntry`:

Recommended v1 approach:

* Create `journalEntry` model with:

  * `id`, `householdId?`, `authorProfileId`, `entryDate`, `entryText`
  * `entryType` enum: `PERSONAL`, `DISCIPLESHIP`, optional `HOUSEHOLD`
  * Optional linking: `subjectMemberId?` for kids later
* Create `journalEntryAI` model to store Call 1 structured output and Call 2 structured output.

If you want to keep it minimal initially:

* You can keep `tags String[]` on the entry model, but still treat tags as typed in JSON outputs, and store the typed tag object in `journalEntryAI`.

### Acceptance criteria

* Entry save triggers Call 1, shows reflection
* Call 2 generates tags and prayer suggestions, shows within a second or two after Call 1
* Continue in Chat creates a new chat thread seeded with entry and reflection
* Journal dashboard list works with filters

---

## Phase 3: Ship Kids Discipleship v1 (Heritage Builder)

### Scope

* Unified Kids Discipleship page at `/kids-discipleship` with tabs per child
* Annual Plan with Four Elements (from Dr. Gifford's framework)
* Monthly Vision for focus and drift prevention
* Child logs reuse journal entry UI with `entryType = DISCIPLESHIP`
* Log categories: "Nurture" (positive reinforcement) and "Admonition" (correction/instruction) stored as a `category` field
* Prayer focus derived from logs, not yet promoted into Prayer Tracker objects

### UI deliverables

1. Kids Discipleship page with child tabs

* Each tab shows child overview and the 5 sections listed above

2. Annual Vision editor
3. Monthly Vision editor
4. Logs list and log entry create dialog
5. Monthly Review dashboard per child

### Data model additions

1. Add child birthdate already done in Phase 1.
2. Add:

* `DiscipleshipAnnualPlan` linked to child member, keyed by year (immutable after year ends)
  * Fields: year, characterGoal, characterScripture, characterAction, competencyGoal, competencyScripture, competencyAction, competencyType, blessingsPlan, consequencesPlan, themeVerse
* `DiscipleshipMonthlyVision` linked to child member, keyed by year-month (immutable after month ends)
  * Fields: yearMonth, memoryVerse, characterFocus, competencyFocus, emphasize, watchFor, encourage, correct
* Historical records are never deleted or overwritten—UI shows "History" tab with past years/months

3. Logs

* Use the same `journalEntry` model with `entryType = DISCIPLESHIP` and `subjectMemberId = child.id`.

### LLM integration

* Call 1 reflection for kids logs shows parent shepherding guidance
* Call 2 tags and suggested prayer requests are generated but only displayed as “Prayer Focus suggestions” in v1, not yet written into Prayer Tracker requests

### Acceptance criteria

* Both parents can add and view child visions and logs
* Monthly vision is editable and visible
* Prayer focus is derived consistently from recent logs
* Kids dashboards load quickly and match tags

---

## Phase 4: Integrate with Prayer Tracker

### Scope

* Promote journal-derived items and kids log-derived items into Prayer Tracker requests
* Cross-link entries and prayer requests
* Unified dashboards across modules

### Key integration features

1. Promote to prayer requests

* From Journal v1:

  * “Add to Personal Requests” creates `prayerPersonalRequest`
* From Kids:

  * “Add to Household Prayer” creates a request linked to the household, tagged to the child, stored either as:

    * `prayerPersonalRequest` with `requesterMemberId` set to child member id, plus tags, or
    * a new `prayerChildRequest` model if you want separation

2. Cross-links

* Add optional fields to prayer request models:

  * `linkedJournalEntryId String?`
* This allows “jump back to the entry that created this prayer request”.

3. Unified dashboards

* Household dashboard view:

  * Prayer rotation stats (existing)
  * Journal trend highlights (top tags)
  * Kids highlights (wins vs struggles, current monthly focus)
  * “Suggested focus for family worship” is a future enhancement, but you can compute basic “top theme of the month” now.

### Acceptance criteria

* One-click promotion from journal or kids log to prayer requests
* Requests appear in Prayer Tracker, participate in rotation workflows as designed
* Cross-links work both directions
* Unified household dashboard is useful and not noisy
---

# Implementation Readiness Summary

## New Files Required (by Phase)

### Phase 1 (Household Layer)
| File | Purpose |
|------|---------|
| `lib/householdService.ts` | Shared membership lookup and access control |
| `utils/ageUtils.ts` | Age calculation, bracket detection, formatting |

### Phase 2 (Journal v1)
| File | Purpose |
|------|---------|
| `lib/prompts/journal.ts` | LLM prompt templates for Call 1 and Call 2 |
| `utils/journal/llm.ts` | AI pipeline functions |
| `app/api/journal/entries/route.ts` | List and create entries |
| `app/api/journal/entries/[id]/route.ts` | Entry detail and updates |
| `app/api/journal/entries/[id]/continue-chat/route.ts` | Seed chat thread |
| `app/journal/page.tsx` | Journal UI |

### Phase 3 (Kids Discipleship)
| File | Purpose |
|------|---------|
| `lib/prompts/kids-discipleship.ts` | LLM prompt templates for parent shepherding |
| `utils/kids-discipleship/llm.ts` | AI pipeline for kids logs |
| `utils/kids-discipleship/prayerFocus.ts` | Derive prayer/praise items from logs |
| `app/api/kids-discipleship/annual-plan/route.ts` | Annual plan CRUD |
| `app/api/kids-discipleship/monthly-vision/route.ts` | Monthly vision CRUD |
| `app/api/kids-discipleship/logs/route.ts` | Log list and create |
| `app/kids-discipleship/page.tsx` | Kids UI with child tabs |

### Phase 4 (Prayer Integration)
| File | Purpose |
|------|---------|
| `app/api/journal/entries/[id]/promote-to-prayer/route.ts` | Promote journal item |
| `app/api/kids-discipleship/logs/[id]/promote-to-prayer/route.ts` | Promote kids item |
| `app/api/household/overview/route.ts` | Unified dashboard data |
| `app/household/overview/page.tsx` | Household dashboard UI |

## Schema Changes (Cumulative)

```prisma
// Phase 1: Add to prayerMember
birthdate DateTime?

// Phase 2: New tables
enum JournalEntryType { PERSONAL, DISCIPLESHIP }
enum LogCategory { NURTURE, ADMONITION }  // Ephesians 6:4
model journalEntry { ... }
model journalEntryAI { ... }

// Phase 3: New tables
enum CompetencyType { PROFESSIONAL, PERSONAL }
model discipleshipAnnualPlan { ... }
model discipleshipMonthlyVision { ... }

// Phase 4: Add to prayerPersonalRequest and prayerFamilyRequest
linkedJournalEntryId String?
subjectMemberId String? // prayerPersonalRequest only
```

## Pre-Implementation Checklist

Before starting Phase 1:
- [ ] Confirm Phase 1 branch is created (`git checkout -b journal_kids`)
- [ ] Review this document and implementation plans
- [ ] Run `npm install` and `npm run dev` to verify current state
- [ ] Create `birthdate` migration
- [ ] Create `lib/householdService.ts`
- [ ] Create `utils/ageUtils.ts`
- [ ] Update member routes to include birthdate
- [ ] Test Prayer Tracker still works