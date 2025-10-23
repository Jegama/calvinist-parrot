import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/prayer-tracker/requests
 * Fetches all requests (both household and family-specific) for the user's space
 * Returns a unified array with familyId to distinguish between types
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json([]);

  // Fetch household requests (prayerPersonalRequest)
  const householdRequests = await prisma.prayerPersonalRequest.findMany({
    where: { spaceId: membership.spaceId, status: { not: "ARCHIVED" } },
    orderBy: [{ dateUpdated: "desc" }],
  });

  // Fetch family-specific requests (prayerFamilyRequest) with family details
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
    },
    orderBy: [{ dateUpdated: "desc" }],
  });

  // Transform to unified format
  const unifiedRequests = [
    // Household requests (familyId = null)
    ...householdRequests.map((req) => ({
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
    })),
    // Family-specific requests
    ...familyRequestsRaw.map((req) => ({
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
    })),
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
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  type CreateRequestPayload = {
    userId?: string;
    requestText?: string;
    notes?: string | null;
    linkedScripture?: string | null;
    linkedToFamily?: string; // "household" or a familyId
  };

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { userId, requestText, notes, linkedScripture, linkedToFamily }: CreateRequestPayload = {
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
  };

  if (!userId || !requestText)
    return NextResponse.json({ error: "Missing userId or requestText" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

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
    });
  }
}
