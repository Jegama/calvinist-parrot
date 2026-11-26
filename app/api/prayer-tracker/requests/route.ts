import { NextResponse } from "next/server";
import { recordJournalFollowOn } from "@/lib/analytics/engagement-journal";
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

  // Get user profile for privacy checks (authorProfileId uses profile.id, not appwrite userId)
  const profile = await prisma.userProfile.findUnique({
    where: { appwriteUserId: userId },
    select: { id: true },
  });

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
      family: { spaceId: membership.spaceId },
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
    // PERSONAL entries are only visible to the author (compare profile.id, not appwrite userId)
    return profile ? entry.authorProfileId === profile.id : false;
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

async function findLinkableJournalEntry(id: string, userId: string, spaceId: string) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    select: { id: true, entryType: true, spaceId: true, authorProfileId: true },
  });
  if (!entry) return null;
  if (entry.entryType === "DISCIPLESHIP") return entry.spaceId === spaceId ? entry : null;

  // A personal entry can predate household membership and belongs to its author.
  const author = await prisma.userProfile.findUnique({
    where: { id: entry.authorProfileId, appwriteUserId: userId },
    select: { id: true },
  });
  return author ? entry : null;
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
    requestText?: string;
    notes?: string | null;
    linkedScripture?: string | null;
    linkedToFamily?: string; // "household" or a familyId
    // Phase 4: Cross-linking fields
    linkedJournalEntryId?: string | null;
    subjectMemberId?: string | null;
  };

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { requestText, notes, linkedScripture, linkedToFamily, linkedJournalEntryId, subjectMemberId }: CreateRequestPayload = {
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

  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!requestText)
    return NextResponse.json({ error: "Missing requestText" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: authenticatedUserId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const linkedEntry = linkedJournalEntryId
    ? await findLinkableJournalEntry(linkedJournalEntryId, authenticatedUserId, membership.spaceId)
    : null;

  // Route to appropriate table based on linkedToFamily
  if (linkedToFamily === "household" || !linkedToFamily) {
    // Create household request
    const created = await prisma.$transaction(async (tx) => {
      const saved = await tx.prayerPersonalRequest.create({
        data: {
          spaceId: membership.spaceId,
          requestText,
          notes: notes || null,
          linkedScripture: linkedScripture || null,
          requesterMemberId: membership.id,
          linkedJournalEntryId: linkedEntry?.id ?? null,
          subjectMemberId: subjectMemberId || null,
        },
      });
      // Both journal suggestion panels save household requests with a validated source entry.
      if (linkedEntry) {
        const feature = linkedEntry.entryType === "PERSONAL" ? "personal_journal" : "heritage_journal";
        await recordJournalFollowOn(tx, feature, "prayer_saved", linkedEntry.id);
      }
      return saved;
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
      linkedEntryType: linkedEntry?.entryType ?? null,
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
        linkedJournalEntryId: linkedEntry?.id ?? null,
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
      linkedEntryType: linkedEntry?.entryType ?? null,
    });
  }
}
