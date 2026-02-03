import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

/**
 * GET /api/prayer-tracker/requests
 * Fetches all requests (both household and family-specific) for the user's space
 * Returns a unified array with familyId to distinguish between types
 * Privacy: linkedJournalEntryId is only returned if user is the entry author OR entry is DISCIPLESHIP type
 */
export async function GET() {
  const { errorResponse, userId } = await requireAuthenticatedUser();
  if (errorResponse || !userId) return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json([]);

  // Fetch household requests (prayerPersonalRequest) with linked entry for privacy check
  const householdRequests = await prisma.prayerPersonalRequest.findMany({
    where: { spaceId: membership.spaceId, status: { not: "ARCHIVED" } },
    include: {
      linkedEntry: {
        select: {
          id: true,
          entryType: true,
          authorProfileId: true,
        },
      },
    },
    orderBy: [{ dateUpdated: "desc" }],
  });

  // Fetch family-specific requests (prayerFamilyRequest) with family details and linked entry
  const familyRequestsRaw = await prisma.prayerFamilyRequest.findMany({
    where: {
      family: { spaceId: membership.spaceId, archivedAt: null },
      status: { not: "ARCHIVED" },
    },
    include: {
      family: {
        select: {
          id: true,
          familyName: true,
        },
      },
      linkedEntry: {
        select: {
          id: true,
          entryType: true,
          authorProfileId: true,
        },
      },
    },
    orderBy: [{ dateUpdated: "desc" }],
  });

  // Helper to check if user can see the linked entry
  const canSeeLinkedEntry = (entry: { entryType: string; authorProfileId: string } | null): boolean => {
    if (!entry) return false;
    // DISCIPLESHIP entries are household-shared
    if (entry.entryType === "DISCIPLESHIP") return true;
    // PERSONAL entries are only visible to the author
    return entry.authorProfileId === userId;
  };

  // Transform to unified format
  const unifiedRequests = [
    // Household requests (familyId = null)
    ...householdRequests.map((req) => {
      const showLink = canSeeLinkedEntry(req.linkedEntry);
      return {
        id: req.id,
        requestText: req.requestText,
        notes: req.notes,
        linkedScripture: req.linkedScripture,
        lastPrayedAt: req.lastPrayedAt?.toISOString() || null,
        dateAdded: req.dateAdded.toISOString(),
        status: req.status,
        answeredAt: req.answeredAt?.toISOString() || null,
        familyId: null,
        familyName: null,
        // Phase 4: Cross-linking (privacy-aware)
        linkedJournalEntryId: showLink ? req.linkedJournalEntryId : null,
        linkedEntryType: showLink && req.linkedEntry ? req.linkedEntry.entryType : null,
        subjectMemberId: req.subjectMemberId,
      };
    }),
    // Family-specific requests
    ...familyRequestsRaw.map((req) => {
      const showLink = canSeeLinkedEntry(req.linkedEntry);
      return {
        id: req.id,
        requestText: req.requestText,
        notes: req.notes,
        linkedScripture: req.linkedScripture,
        lastPrayedAt: req.lastPrayedAt?.toISOString() || null,
        dateAdded: req.dateAdded.toISOString(),
        status: req.status,
        answeredAt: req.answeredAt?.toISOString() || null,
        familyId: req.familyId,
        familyName: req.family.familyName,
        // Phase 4: Cross-linking (privacy-aware)
        linkedJournalEntryId: showLink ? req.linkedJournalEntryId : null,
        linkedEntryType: showLink && req.linkedEntry ? req.linkedEntry.entryType : null,
      };
    }),
  ];

  // Sort by dateUpdated descending
  unifiedRequests.sort((a, b) => {
    return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
  });

  return NextResponse.json(unifiedRequests);
}

/**
 * POST /api/prayer-tracker/requests
 * Creates a request - routes to either prayerPersonalRequest or prayerFamilyRequest
 * based on the linkedToFamily field
 * Phase 4: Accepts optional linkedJournalEntryId and subjectMemberId for cross-linking
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  type CreateRequestPayload = {
    userId?: string;
    requestText?: string;
    notes?: string | null;
    linkedScripture?: string | null;
    linkedToFamily?: string; // "household" or a familyId
    // Phase 4: Cross-linking fields
    linkedJournalEntryId?: string | null;
    subjectMemberId?: string | null;
  };

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { userId, requestText, notes, linkedScripture, linkedToFamily, linkedJournalEntryId, subjectMemberId }: CreateRequestPayload = {
    userId: typeof payload.userId === "string" ? payload.userId : undefined,
    requestText: typeof payload.requestText === "string" ? payload.requestText : undefined,
    notes:
      typeof payload.notes === "string"
        ? payload.notes
        : payload.notes === null
        ? null
        : undefined,
    linkedScripture:
      typeof payload.linkedScripture === "string"
        ? payload.linkedScripture
        : payload.linkedScripture === null
        ? null
        : undefined,
    linkedToFamily: typeof payload.linkedToFamily === "string" ? payload.linkedToFamily : "household",
    linkedJournalEntryId: typeof payload.linkedJournalEntryId === "string" ? payload.linkedJournalEntryId : null,
    subjectMemberId: typeof payload.subjectMemberId === "string" ? payload.subjectMemberId : null,
  };

  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!requestText)
    return NextResponse.json({ error: "Missing requestText" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: authenticatedUserId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  // Phase 4: Validate linkedJournalEntryId belongs to the same household
  let validatedEntryId: string | null = null;
  let linkedEntryType: string | null = null;
  if (linkedJournalEntryId) {
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id: linkedJournalEntryId,
        spaceId: membership.spaceId, // Must belong to same household
      },
      select: { id: true, entryType: true },
    });
    if (entry) {
      validatedEntryId = entry.id;
      linkedEntryType = entry.entryType;
    }
    // If entry doesn't exist or belongs to different household, silently ignore (don't block creation)
  }

  // Route to appropriate table based on linkedToFamily
  if (linkedToFamily === "household" || !linkedToFamily) {
    // Create household request
    const created = await prisma.prayerPersonalRequest.create({
      data: {
        spaceId: membership.spaceId,
        requestText,
        notes: notes || null,
        linkedScripture: linkedScripture || null,
        requesterMemberId: membership.id,
        linkedJournalEntryId: validatedEntryId,
        subjectMemberId: subjectMemberId || null,
      },
    });

    return NextResponse.json({
      id: created.id,
      requestText: created.requestText,
      notes: created.notes,
      linkedScripture: created.linkedScripture,
      lastPrayedAt: created.lastPrayedAt?.toISOString() || null,
      dateAdded: created.dateAdded.toISOString(),
      status: created.status,
      answeredAt: created.answeredAt?.toISOString() || null,
      familyId: null,
      familyName: null,
      linkedJournalEntryId: created.linkedJournalEntryId,
      linkedEntryType,
      subjectMemberId: created.subjectMemberId,
    });
  } else {
    // Verify family exists in user's space
    const family = await prisma.prayerFamily.findFirst({
      where: { id: linkedToFamily, spaceId: membership.spaceId },
      select: { id: true, familyName: true },
    });

    if (!family) {
      return NextResponse.json({ error: "Family not found in your space" }, { status: 404 });
    }

    // Create family-specific request
    const created = await prisma.prayerFamilyRequest.create({
      data: {
        familyId: linkedToFamily,
        requestText,
        notes: notes || null,
        linkedScripture: linkedScripture || null,
        linkedJournalEntryId: validatedEntryId,
      },
    });

    return NextResponse.json({
      id: created.id,
      requestText: created.requestText,
      notes: created.notes,
      linkedScripture: created.linkedScripture,
      lastPrayedAt: created.lastPrayedAt?.toISOString() || null,
      dateAdded: created.dateAdded.toISOString(),
      status: created.status,
      answeredAt: created.answeredAt?.toISOString() || null,
      familyId: created.familyId,
      familyName: family.familyName,
      linkedJournalEntryId: created.linkedJournalEntryId,
      linkedEntryType,
    });
  }
}
