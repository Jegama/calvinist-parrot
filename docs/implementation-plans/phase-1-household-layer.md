# Phase 1 – Household Layer Generalization

**Source Documents:**
- [Roadmap for houshold, journal, and kids discipleship.md](../Roadmap%20for%20houshold,%20journal,%20and%20kids%20discipleship.md) — Master plan with shared foundation specs

## Objectives
- Generalize the existing prayer space into a reusable Household container without breaking Prayer Tracker.
- Introduce member birthdates for age calculation (used later for Kids Discipleship tab labels, bracket badges, and eligibility logic).
- Keep existing routes functioning while preparing neutral naming for future modules (Journal, Kids Discipleship).

## Key Decisions (Resolved)

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| **Model renaming strategy** | Keep original Prisma model names (`prayerFamilySpace`, `prayerMember`) | Avoids unnecessary code churn; use TypeScript type aliases if cleaner naming is desired in consuming code |
| **Field naming: `spaceId` vs `householdId`** | Keep `spaceId` everywhere | Existing field; no migration needed. Document that `spaceId` = household ID for new features |
| **`@@map` usage** | Skip for Phase 1 | Adds complexity without benefit; revisit only if model naming becomes confusing at scale |

## Current State (key references)
- Prisma models: prayerFamilySpace, prayerMember, prayerFamily, prayerPersonalRequest, prayerFamilyRequest, prayerJournalEntry in [prisma/schema.prisma](prisma/schema.prisma).
- Space bootstrap + membership lookup in [app/api/prayer-tracker/spaces/route.ts](app/api/prayer-tracker/spaces/route.ts).
- Member add/update in [app/api/prayer-tracker/members/route.ts](app/api/prayer-tracker/members/route.ts).
- Client entry point page at [app/prayer-tracker/page.tsx](app/prayer-tracker/page.tsx) with hooks under `app/prayer-tracker/hooks/**` and API helper at [app/prayer-tracker/api.ts](app/prayer-tracker/api.ts).

## Data Model Plan

### 1. Add birthdate to members (REQUIRED)

The `birthdate` field does not currently exist in the schema. Add it:

```prisma
// prisma/schema.prisma - prayerMember model
model prayerMember {
  id             String            @id @default(cuid())
  spaceId        String
  appwriteUserId String?
  displayName    String
  role           MemberRole        @default(MEMBER)
  isChild        Boolean           @default(false)
  birthdate      DateTime?         // NEW: for age calculation
  assignmentCapacity Int           @default(2)
  assignmentCount    Int           @default(0)
  joinedAt       DateTime          @default(now())
  // ... existing relations
}
```

**Migration command:**
```bash
npx prisma migrate dev --name add_member_birthdate
```

### 2. Keep existing model names
- **Do NOT rename** `prayerFamilySpace`, `prayerMember`, etc. with `@@map` in Phase 1.
- Use `spaceId` consistently (it represents the household ID).
- Future phases reference `spaceId` in new tables (e.g., `journalEntry.spaceId`).

### 3. Optional fields (defer to later phases)
- `timezone String?` — Only add if age threshold calculations require locale precision (not needed for v1).

## Backend Plan

### Shared Household Service (REQUIRED - New File)

Create `lib/householdService.ts` to encapsulate membership lookup and access control. This eliminates duplicated logic across routes.

```typescript
// lib/householdService.ts
import prisma from "@/lib/prisma";

export type HouseholdMembership = {
  memberId: string;
  spaceId: string;
  role: "OWNER" | "MEMBER";
  displayName: string;
};

/**
 * Get the household membership for a user by their Appwrite ID.
 * Returns null if user has no household.
 */
export async function getMembershipForUser(
  appwriteUserId: string
): Promise<HouseholdMembership | null> {
  const member = await prisma.prayerMember.findFirst({
    where: { appwriteUserId },
    select: {
      id: true,
      spaceId: true,
      role: true,
      displayName: true,
    },
  });
  if (!member) return null;
  return {
    memberId: member.id,
    spaceId: member.spaceId,
    role: member.role as "OWNER" | "MEMBER",
    displayName: member.displayName,
  };
}

/**
 * Assert user has access to a specific space. Throws if unauthorized.
 */
export async function assertHouseholdAccess(
  appwriteUserId: string,
  spaceId: string
): Promise<HouseholdMembership> {
  const member = await prisma.prayerMember.findFirst({
    where: { appwriteUserId, spaceId },
    select: { id: true, spaceId: true, role: true, displayName: true },
  });
  if (!member) {
    throw new Error("User does not have access to this household");
  }
  return {
    memberId: member.id,
    spaceId: member.spaceId,
    role: member.role as "OWNER" | "MEMBER",
    displayName: member.displayName,
  };
}

/**
 * Assert user is the owner of their household. Throws if not owner.
 */
export async function assertOwnerAccess(
  appwriteUserId: string
): Promise<HouseholdMembership> {
  const membership = await getMembershipForUser(appwriteUserId);
  if (!membership) {
    throw new Error("No household found for user");
  }
  if (membership.role !== "OWNER") {
    throw new Error("Only the owner can perform this action");
  }
  return membership;
}
```

### API Route Updates

- **Prisma client adoption:** No model renames; continue using `prayerMember`, `prayerFamilySpace`, etc.
- **Refactor existing routes** to use `lib/householdService.ts`:
  - `app/api/prayer-tracker/spaces/route.ts` — use `getMembershipForUser`
  - `app/api/prayer-tracker/members/route.ts` — use `assertOwnerAccess`
  - `app/api/prayer-tracker/journal/route.ts` — use `getMembershipForUser`
- **Member birthdate handling:**
  - Accept optional `birthdate` in member POST/PATCH; validate ISO date string; store as DateTime.
  - Update all member `select` clauses to include `birthdate` where members are returned.
- **Profile linkage:**
  - When creating a space, continue updating `userProfile.defaultSpaceId`. No schema change required.

## Frontend Plan

### Hooks and Types
- Extend `Member` type in `app/prayer-tracker/types.ts`:
  ```typescript
  export type Member = {
    id: string;
    displayName: string;
    role: string;
    appwriteUserId?: string | null;
    assignmentCapacity?: number;
    assignmentCount?: number;
    isChild?: boolean;
    birthdate?: string | null; // NEW: ISO date string
  };
  ```
- Propagate through hooks (`use-prayer-space`, `use-rotation-workflow`).
- Ensure React Query keys stay the same; only add fields to the returned payloads.

### Age Calculation Utility (REQUIRED - New File)

Create `utils/ageUtils.ts`:

```typescript
// utils/ageUtils.ts

export type AgeBracket = 
  | "INFANT_TODDLER"    // 0-3 years
  | "EARLY_CHILDHOOD"   // 3-6 years  
  | "MIDDLE_CHILDHOOD"  // 7-12 years
  | "ADOLESCENCE";      // 13-17 years

export const AGE_BRACKET_CONFIG: Record<AgeBracket, { min: number; max: number; label: string; description: string }> = {
  INFANT_TODDLER: {
    min: 0,
    max: 3,
    label: "Infant/Toddler",
    description: "Focus on authority, atmosphere, simple habits. Heavy parental input, low child output.",
  },
  EARLY_CHILDHOOD: {
    min: 3,
    max: 6,
    label: "Early Childhood",
    description: "Begin introducing responsibility, simple obedience explanations.",
  },
  MIDDLE_CHILDHOOD: {
    min: 7,
    max: 12,
    label: "Middle Childhood",
    description: "Growing independence, more complex character work, academic competencies.",
  },
  ADOLESCENCE: {
    min: 13,
    max: 17,
    label: "Adolescence",
    description: "Preparing for adulthood, increased autonomy, deeper theological discussions.",
  },
};

/**
 * Calculate age from birthdate.
 */
export function calculateAge(birthdate: string | Date): { years: number; months: number } {
  const birth = typeof birthdate === "string" ? new Date(birthdate) : birthdate;
  const now = new Date();
  
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  
  if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }
  if (now.getDate() < birth.getDate()) {
    months--;
    if (months < 0) months += 12;
  }
  
  return { years: Math.max(0, years), months: Math.max(0, months) };
}

/**
 * Get age bracket for a birthdate. Returns null if age >= 18 or invalid.
 */
export function getAgeBracket(birthdate: string | Date): AgeBracket | null {
  const { years } = calculateAge(birthdate);
  
  if (years < 0 || years >= 18) return null;
  if (years <= 3) return "INFANT_TODDLER";
  if (years <= 6) return "EARLY_CHILDHOOD";
  if (years <= 12) return "MIDDLE_CHILDHOOD";
  return "ADOLESCENCE";
}

/**
 * Format age for display (e.g., "7 months", "2 years", "2 years 3 months").
 */
export function formatAge(birthdate: string | Date): string {
  const { years, months } = calculateAge(birthdate);
  
  if (years === 0) {
    return months === 1 ? "1 month" : `${months} months`;
  }
  if (months === 0) {
    return years === 1 ? "1 year" : `${years} years`;
  }
  const yearStr = years === 1 ? "1 year" : `${years} years`;
  const monthStr = months === 1 ? "1 month" : `${months} months`;
  return `${yearStr} ${monthStr}`;
}

/**
 * Get bracket label for display (e.g., "Infant/Toddler").
 */
export function getBracketLabel(bracket: AgeBracket): string {
  return AGE_BRACKET_CONFIG[bracket].label;
}
```

### UI Updates
- Member create/edit flows: add optional Birthdate input (date picker); show age chip where members are listed and in rotation UI.
- Guard age calculation client-side (handle null and invalid dates) and display as `Age: X` or `Age: –`.
- For children, show bracket badge (e.g., "Infant/Toddler") next to age.

### Routing
- Keep Prayer Tracker screens using existing `/api/prayer-tracker/*` endpoints.
- New Journal/Kids Discipleship screens will use `/api/journal/*` and `/api/kids-discipleship/*` respectively.
- Both consume the shared `lib/householdService.ts` for membership resolution.

## Migration & QA

### Migration Steps
1. Run `npx prisma migrate dev --name add_member_birthdate` to add the birthdate column.
2. Regenerate client with `npx prisma generate`.
3. Verify no breaking changes to existing queries.

### Testing Checklist
- [ ] Space creation works as before
- [ ] Member add/edit works with and without birthdate
- [ ] Rotation assigns families correctly (birthdates don't affect logic)
- [ ] Requests creation/update unaffected
- [ ] Age display shows correctly for children with birthdates
- [ ] Age display shows "–" for members without birthdates
- [ ] Bracket badges display correctly based on calculated age

### New File Verification
- [ ] `lib/householdService.ts` exports `getMembershipForUser`, `assertHouseholdAccess`, `assertOwnerAccess`
- [ ] `utils/ageUtils.ts` exports `calculateAge`, `getAgeBracket`, `formatAge`, `getBracketLabel`, `AGE_BRACKET_CONFIG`

## Deliverables Checklist

| Deliverable | Type | Path |
|-------------|------|------|
| Birthdate migration | Schema | `prisma/schema.prisma` |
| Household service | New file | `lib/householdService.ts` |
| Age utilities | New file | `utils/ageUtils.ts` |
| Member type update | Edit | `app/prayer-tracker/types.ts` |
| Birthdate in member API | Edit | `app/api/prayer-tracker/members/route.ts` |
| Birthdate in spaces API | Edit | `app/api/prayer-tracker/spaces/route.ts` |

## Risks / Mitigations
- **Risk:** Missing birthdate handling in selects. **Mitigation:** Add `birthdate` to all member `select` clauses where members are returned.
- **Risk:** Invalid birthdate strings from client. **Mitigation:** Validate ISO 8601 format server-side; return 400 on invalid input.
