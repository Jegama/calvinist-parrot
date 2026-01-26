# Phase 4 – Prayer Tracker Integration

**Source Documents:**
- [Roadmap for houshold, journal, and kids discipleship.md](../Roadmap%20for%20houshold,%20journal,%20and%20kids%20discipleship.md) — Master plan with integration specs
- [Prayer Tracker Feature One Pager.md](../Prayer%20Tracker%20Feature%20One%20Pager.md) — Current Prayer Tracker architecture

## Objectives
- Promote Personal Journal and Heritage Journal entries into Prayer Tracker requests with cross-links.
- Keep rotation and request flows stable while adding metadata.
- Build a unified household dashboard with highlights from prayer, personal reflection, and kids discipleship modules.

**Feature Branding Context:**
- **Personal Journal**: Daily reflections with pastoral insight (route: `/journal`)
- **Heritage Journal**: Building faith with your children (route: `/kids-discipleship`)
- Both integrate with Prayer Tracker to turn reflection into prayer action.

## Dependencies
- **Phase 1:** `lib/householdService.ts` for access control
- **Phase 2:** `journalEntry` and `journalEntryAI` models
- **Phase 3:** Kids logs using `journalEntry` with `entryType = DISCIPLESHIP`

## Data Model Plan

### Cross-Link Fields (REQUIRED)

Add to existing request models:

```prisma
model prayerPersonalRequest {
  id                   String            @id @default(cuid())
  spaceId              String
  status               RequestStatus     @default(ACTIVE)
  requestText          String
  notes                String?
  linkedScripture      String?
  requesterMemberId    String?
  
  // NEW: Cross-linking fields
  linkedJournalEntryId String?           // Links to journalEntry.id
  subjectMemberId      String?           // Child member for kids-related requests
  
  dateAdded            DateTime          @default(now())
  dateUpdated          DateTime          @updatedAt
  lastPrayedAt         DateTime?
  answeredAt           DateTime?
  
  space                prayerFamilySpace @relation(fields: [spaceId], references: [id])
  linkedEntry          journalEntry?     @relation("PersonalRequestSource", fields: [linkedJournalEntryId], references: [id], onDelete: SetNull)

  @@index([linkedJournalEntryId])
  @@index([subjectMemberId])
}

model prayerFamilyRequest {
  id                   String        @id @default(cuid())
  familyId             String
  status               RequestStatus @default(ACTIVE)
  requestText          String
  notes                String?
  linkedScripture      String?
  
  // NEW: Cross-linking field
  linkedJournalEntryId String?       // Links to journalEntry.id
  
  dateAdded            DateTime      @default(now())
  dateUpdated          DateTime      @updatedAt
  lastPrayedAt         DateTime?
  answeredAt           DateTime?
  
  family               prayerFamily  @relation(fields: [familyId], references: [id])
  linkedEntry          journalEntry? @relation("FamilyRequestSource", fields: [linkedJournalEntryId], references: [id], onDelete: SetNull)

  @@index([linkedJournalEntryId])
}
```

### Add Relations to journalEntry

```prisma
model journalEntry {
  // ... existing fields
  
  // New relations for cross-linking
  personalRequests prayerPersonalRequest[] @relation("PersonalRequestSource")
  familyRequests   prayerFamilyRequest[]   @relation("FamilyRequestSource")
}
```

### Migration Command
```bash
npx prisma migrate dev --name add_prayer_crosslinks
```

### Key Constraints
- **`onDelete: SetNull`** — If a journal entry is deleted, linked requests keep the request text but lose the link (avoids blocking deletions).
- **Household validation** — API must verify that `linkedJournalEntryId` belongs to same `spaceId` as the request.

## Backend/API Plan
- **Promotion endpoints:**
  - `/api/journal/entries/[id]/promote-to-prayer` creates household request from a suggestion; payload includes `requestText`, `notes`, `linkedScripture?`, `linkedJournalEntryId`, `subjectMemberId?`. Internally calls existing request creation with linkage.
  - `/api/kids/logs/[id]/promote-to-prayer` for child-focused items; sets `subjectMemberId` and `linkedJournalEntryId`.
- **Request APIs:**
  - Update `/api/prayer-tracker/requests` POST/PATCH to accept optional `linkedJournalEntryId` and `subjectMemberId`; expose in GET payloads so UI can deep-link back.
  - Ensure request validation checks that the linked entry belongs to the same household.
- **Rotation:** keep existing logic; only surface links in returned personal/family items (include `linkedJournalEntryId` in selects in rotation GET).
- **Dashboard endpoint:** `/api/household/overview` that bundles:
  - Prayer stats (active requests, answered counts, rotation last run).
  - Journal highlights (top tags, recent entries) via `journalEntry`/`journalEntryAI` aggregates.
  - Kids highlights (wins vs struggles counts, current monthly focus, prayer focus items).

## Frontend Plan
- **Journal UI:**
  - In Reflection card, add "Add to Personal Requests" action per suggested item; on success, show link back to the created request and mark suggestion as accepted.
  - Display backlink on requests (e.g., badge "From Journal" that links to the entry detail page).
- **Kids UI:**
  - In Prayer Focus panel, add "Add to Household Prayer" / "Add to Child Prayer" buttons. For child-specific, set `subjectMemberId`.
- **Prayer Tracker UI:**
  - Requests list and family detail dialog show a small link button to open the source entry (if `linkedJournalEntryId` present). Use the same styling as existing notes/scripture badges.
  - Keep query invalidation consistent: after promotion, invalidate `['prayer-requests', householdId]` and relevant journal/kids queries to mark suggestions accepted.
- **Household dashboard (new):**
  - New route `app/household/overview` (or section on Prayer Tracker) displaying combined stats; uses the overview endpoint.

## Migration & QA

### Migration Steps
1. Run `npx prisma migrate dev --name add_prayer_crosslinks` to add link fields.
2. Regenerate client.
3. Update request `select` clauses to include new fields.

### Testing Checklist
- [ ] Promotion from journal entry creates request with `linkedJournalEntryId`
- [ ] Promotion from kids log creates request with `linkedJournalEntryId` and `subjectMemberId`
- [ ] Request list shows "From Journal" badge when linked
- [ ] Clicking badge navigates to source entry
- [ ] Deleting journal entry sets `linkedJournalEntryId` to null (not cascade delete)
- [ ] Cross-household linking is rejected (400 error)
- [ ] Rotation endpoint includes link data without affecting assignment logic
- [ ] Dashboard aggregates stats correctly

## Deliverables Checklist

| Deliverable | Type | Path |
|-------------|------|------|
| Cross-link migration | Schema | `prisma/schema.prisma` |
| Journal promote route | New file | `app/api/journal/entries/[id]/promote-to-prayer/route.ts` |
| Kids promote route | New file | `app/api/kids-discipleship/logs/[id]/promote-to-prayer/route.ts` |
| Update requests route | Edit | `app/api/prayer-tracker/requests/route.ts` |
| Household overview route | New file | `app/api/household/overview/route.ts` |
| Request types update | Edit | `app/prayer-tracker/types.ts` |
| FromJournalBadge component | New file | `app/prayer-tracker/components/FromJournalBadge.tsx` |
| Household dashboard | New file | `app/household/overview/page.tsx` |

## Risks / Mitigations
- **Data integrity:** `onDelete: SetNull` prevents blocking deletions; API validates household ownership before linking.
- **UX noise:** Limit dashboard highlights to top 5 items per category; use gentle copy per brand voice.
- **Query performance:** Indexes on `linkedJournalEntryId` and `subjectMemberId` for efficient lookups.
