# Memory System Architecture - Implementation Checklist

## ✅ Implementation Complete

This checklist documents the changes made to implement the upgraded memory system architecture. All tasks below are complete.

### Architecture Overview
- **Prisma (Structured)**: denomination, spiritualStatus, doctrinal question counts, ministryContext, churchInvolvement, preferredDepth, followUpTendency → injected each conversation via system prompt.
- **MemoryStore (Unstructured)**: theologicalInterests, concerns, spiritualJourney, lifeStage → retrieved on-demand via `userMemoryRecall` (no doctrinal count mirrors).
- **No Forced Recall**: Agent chooses when to call `userMemoryRecall`; no automatic recall at conversation start.

---

## Completed Tasks

### ✅ 1. Schema & Database
- Added 11 new fields to `userProfile` (see summary doc)
- Default `preferredDepth` corrected to `concise`
- Migration applied & verified

**Key Fields**
- `denomination` (user-controlled, default `reformed-baptist`)
- `spiritualStatus` (PRIVATE; values: seeker | new_believer | growing_believer | mature_believer | unclear)
- Doctrinal question counts (`coreDoctrineQuestions`, `secondaryDoctrineQuestions`, `tertiaryDoctrineQuestions`)
- `gospelPresentationCount` + `gospelPresentedAt`
- `ministryContext[]`, `churchInvolvement`
- Learning preferences: `preferredDepth` (`concise|moderate|detailed`), `followUpTendency` (`deep_diver|quick_mover|balanced`)

### ✅ 2. Profile Page UI
- Denomination selector with 7-option allowlist
- PATCH `/api/user-profile` updates denomination (validated, upsert)

### ✅ 3. System Prompt Injection (`app/api/parrot-chat/route.ts`)
- Fetches userProfile (single Prisma query)
- Normalizes followUpTendency into human-readable form
- Injects `{PASTORAL_CONTEXT}` into `PARROT_SYS_PROMPT_MAIN`
- Includes privacy warning; never surfaces private classifications to user

### ✅ 4. Removed Forced Memory Recall
- Deleted prior cache/hint system
- Tool calls now agent-initiated only

### ✅ 5. Simplified & Enhanced userMemoryRecall Tool
- Stripped all Prisma usage (MemoryStore only)
- Added semantic search
- Added truncation by default + `full: true` option for complete lists
       - Default: top 5 interests, first 5 concerns, last 3 journey notes, recent lifeStage
       - Full mode: full arrays returned + `truncated: false`

### ✅ 6. Memory Extraction & Merge
- Denomination removed from extraction scope
- `growing_believer` status added to prompt schemas & TypeScript unions
- `syncToPrisma()` converts increment ops to initial values for create path

### ✅ 7. Backfill Script
- Updated to call `updateUserMemoriesFromConversation` without denomination argument
- Added `--oldest=<n>` option to limit processing to the first N oldest conversations per user (useful for quick tests like `--oldest=10`)

### ✅ 8. Documentation & Supporting Types
- Summary & checklist updated with new status and truncation behaviors
- Added debug endpoint documentation (`/api/user-memory`)
- Removed `preferences.denomination` and `questionPatterns` from MemoryStore types; doctrinal counts live only in Prisma

---

## Testing Recommendations

### Functional
- Denomination selector persists change (PATCH + reload)
- Pastoral context appears in logs (temporary debug) with normalized follow-up style
- Secondary doctrine block swaps with denomination
- `userMemoryRecall` default returns truncated JSON (`truncated: true`)
- `userMemoryRecall(full: true)` returns full arrays
- Doctrinal question counts increment in Prisma after conversations

### Privacy
- `userMemoryRecall` output contains no `spiritualStatus`
- Agent never echoes status labels (seeker/new_believer/etc.)
- System prompt (logged for debug) includes spiritual status with warning block

### Performance
- Exactly one Prisma profile query per conversation start
- No memory recall log entries unless tool invoked
- Extraction + merge typically < 5s (adjust model if exceeded)
- Default recall payload < ~1KB (truncation working)

### Reliability / Edge Cases
- Missing profile → fallback pastoral context message
- Empty memories → safe empty JSON structures
- Malformed tool query args → handled gracefully (returns empty arrays)

---

## Architecture Summary
### Data Flow Diagram

```
User asks question
       ↓
route.ts: Fetch userProfile from Prisma (1 query)
       ↓
route.ts: Build pastoralContext string (denomination, spiritual status, ministry context, learning prefs, doctrinal counts)
       ↓
route.ts: Inject into system prompt {PASTORAL_CONTEXT}
       ↓
Agent: Has full structured context from start
       ↓
Agent: Calls userMemoryRecall tool IF needed (semantic search of MemoryStore for unstructured details)
       ↓
Agent: Generates response with full context
       ↓
route.ts: Trigger memory extraction in background (non-blocking)
       ↓
memoryExtraction.ts: Extract structured + unstructured data
       ↓
memoryExtraction.ts: syncToPrisma() → update structured fields
       ↓
memoryExtraction.ts: mergeMemories() → update MemoryStore JSON
```

### Key Architectural Decisions

1. **Denomination is User-Controlled**
   - Profile page dropdown (not LLM-inferred)
   - Stored in Prisma
   - Injected into system prompt (not in tool)

2. **Spiritual Status is PRIVATE**
   - LLM infers from conversation
   - Stored in Prisma
   - Injected into system prompt (for agent's use)
   - NEVER in tool output (no Prisma queries in tool)
   - NEVER mentioned to user (explicit prompt warnings)

3. **Prompt Injection > Tool Retrieval**
   - Structured data (Prisma) → fast, always available in prompt
   - Unstructured data (MemoryStore) → semantic search when agent needs details
   - No forced recall at conversation start

4. **Privacy by Design**
   - System prompt injection includes spiritual status
   - Tool queries exclude all private fields
   - Agent warned multiple times to never reveal tracking

---

## Files Changed Summary
| File | Changes | Lines |
|------|---------|-------|
| `prisma/schema.prisma` | Added 11 new fields to `userProfile` | 28-61 |
| `app/profile/page.tsx` | Added denomination selector UI | Multiple |
| `app/profile/types.ts` | Added `denomination` to ProfileStats | 8 |
| `app/api/user-profile/route.ts` | Added PATCH method for denomination | 100+ |
| `lib/prompts/core.ts` | Added `{PASTORAL_CONTEXT}` placeholder, updated tool instructions | 162-172 |
| `app/api/parrot-chat/route.ts` | Added Prisma query + context injection, removed forced recall | 156-248, 350-454 removed |
| `utils/langChainAgents/tools/userMemoryRecallTool.ts` | Removed Prisma queries, kept only MemoryStore | Simplified |
| `utils/memoryExtraction.ts` | Updated comments, fixed Prisma upsert | 136, 253 |
| `scripts/backfill-memories.ts` | Removed denomination parameter | 116 |
| `docs/MEMORY_SYSTEM_UPGRADE_SUMMARY.md` | Complete rewrite for new architecture | All |
| `docs/MEMORY_MIGRATION_CHECKLIST.md` | Updated to reflect completed work | All |

---

## Next Steps (If Applicable)
### For New Deployments
1. Run `npx prisma migrate deploy` (production)
2. Monitor Sentry/logs for memory extraction errors
3. Verify denomination selector works in production UI
4. Test a few conversations to confirm context injection

### For Future Development
- Consider admin dashboard (aggregated insights)
- Add more granular learning preferences
- Integrate with prayer tracker for holistic view
**Status**: ✅ All tasks complete. System ready for use.
- New fields have sensible defaults (denomination="reformed-baptist", counts=0)
- Spiritual status will be "unclear" until LLM extracts it from conversation
- No user-facing changes - all improvements are internal
Refer to:
- `docs/MEMORY_SYSTEM_UPGRADE_SUMMARY.md` - Detailed explanation
- `docs/Master prompt.md` - Doctrinal framework
- `prisma/schema.prisma` - Schema reference
**Ready to migrate?** Start with step 1: Run the Prisma migration command above.
memoryExtraction.ts: mergeMemories() → update MemoryStore JSON
