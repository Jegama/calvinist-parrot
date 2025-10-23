import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type RouteContext = { params: Promise<{ requestId: string }> };

async function getMembership(userId?: string) {
  if (!userId) return null;
  return prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
}

function resolveUserId(request: Request, bodyUserId?: string) {
  if (bodyUserId && bodyUserId.trim().length) return bodyUserId.trim();
  const { searchParams } = new URL(request.url);
  const queryUserId = searchParams.get("userId");
  return queryUserId ?? undefined;
}

/**
 * PATCH /api/prayer-tracker/requests/[requestId]
 * Updates a request - handles both prayerPersonalRequest and prayerFamilyRequest
 * Supports moving requests between tables when linkedToFamily changes
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    requestText?: string;
    notes?: string | null;
    status?: "ACTIVE" | "ANSWERED" | "ARCHIVED";
    markAnswered?: boolean;
    isHouseholdRequest?: boolean; // Current table location
    linkedToFamily?: string; // New family assignment (if changed)
    originalLinkedToFamily?: string; // Original family assignment
  };
  const userId = resolveUserId(request, body.userId);
  const { requestText, notes, status, markAnswered, isHouseholdRequest, linkedToFamily, originalLinkedToFamily } = body;

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const now = new Date();

  // Check if family assignment changed - if so, need to move between tables
  const familyChanged = linkedToFamily !== undefined && originalLinkedToFamily !== undefined && linkedToFamily !== originalLinkedToFamily;

  if (familyChanged) {
    // DELETE from old table and CREATE in new table
    const oldIsHousehold = originalLinkedToFamily === "household";
    const newIsHousehold = linkedToFamily === "household";

    // Fetch existing request data
    let existingRequest: {
      id: string;
      requestText: string;
      notes: string | null;
      linkedScripture: string | null;
      status: "ACTIVE" | "ANSWERED" | "ARCHIVED";
      lastPrayedAt: Date | null;
      answeredAt: Date | null;
    } | null;
    if (oldIsHousehold) {
      existingRequest = await prisma.prayerPersonalRequest.findFirst({
        where: { id: requestId, spaceId: membership.spaceId },
      });
    } else {
      existingRequest = await prisma.prayerFamilyRequest.findFirst({
        where: {
          id: requestId,
          family: { spaceId: membership.spaceId },
        },
        include: { family: { select: { familyName: true } } },
      });
    }

    if (!existingRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Prepare new data
    const newRequestText = typeof requestText === "string" && requestText.trim().length ? requestText.trim() : existingRequest.requestText;
    const newNotes = notes !== undefined ? (notes ? notes.trim() : null) : existingRequest.notes;

    // Delete from old table and create in new table
    if (oldIsHousehold) {
      await prisma.prayerPersonalRequest.delete({ where: { id: requestId } });
    } else {
      await prisma.prayerFamilyRequest.delete({ where: { id: requestId } });
    }

    let created: {
      id: string;
      requestText: string;
      notes: string | null;
      linkedScripture: string | null;
      status: string;
      lastPrayedAt: Date | null;
      answeredAt: Date | null;
      dateAdded: Date;
    };
    if (newIsHousehold) {
      created = await prisma.prayerPersonalRequest.create({
        data: {
          spaceId: membership.spaceId,
          requestText: newRequestText,
          notes: newNotes,
          linkedScripture: existingRequest.linkedScripture,
          requesterMemberId: membership.id,
          status: existingRequest.status,
          lastPrayedAt: existingRequest.lastPrayedAt,
          answeredAt: existingRequest.answeredAt,
        },
      });
    } else {
      // Verify new family exists
      const family = await prisma.prayerFamily.findFirst({
        where: { id: linkedToFamily, spaceId: membership.spaceId },
        select: { id: true, familyName: true },
      });

      if (!family) {
        return NextResponse.json({ error: "Family not found in your space" }, { status: 404 });
      }

      created = await prisma.prayerFamilyRequest.create({
        data: {
          familyId: linkedToFamily,
          requestText: newRequestText,
          notes: newNotes,
          linkedScripture: existingRequest.linkedScripture,
          status: existingRequest.status,
          lastPrayedAt: existingRequest.lastPrayedAt,
          answeredAt: existingRequest.answeredAt,
        },
      });
    }

    // Return the newly created request with unified format
    const familyInfo = newIsHousehold
      ? { familyId: null, familyName: null }
      : await prisma.prayerFamily
          .findUnique({ where: { id: linkedToFamily }, select: { id: true, familyName: true } })
          .then((f) => ({ familyId: f?.id || null, familyName: f?.familyName || null }));

    return NextResponse.json({
      id: created.id,
      requestText: created.requestText,
      notes: created.notes,
      linkedScripture: created.linkedScripture,
      lastPrayedAt: created.lastPrayedAt?.toISOString() || null,
      dateAdded: created.dateAdded.toISOString(),
      status: created.status,
      answeredAt: created.answeredAt?.toISOString() || null,
      ...familyInfo,
    });
  }

  // Normal update path (no family change)
  const data: Record<string, unknown> = {};

  if (typeof requestText === "string" && requestText.trim().length) {
    data.requestText = requestText.trim();
  }
  if (notes !== undefined) {
    data.notes = notes ? notes.trim() : null;
  }

  if (status) {
    data.status = status;
    if (status === "ACTIVE") {
      data.answeredAt = null;
    }
  }

  if (markAnswered) {
    data.status = "ANSWERED";
    data.answeredAt = now;
    data.lastPrayedAt = now;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  // Get all members in this space to update their profiles when marking as answered
  const spaceMembers = markAnswered
    ? await prisma.prayerMember.findMany({
        where: { spaceId: membership.spaceId },
        select: { appwriteUserId: true, displayName: true },
      })
    : [];

  const transactions: Prisma.PrismaPromise<unknown>[] = [];

  // Update the request in the appropriate table
  if (isHouseholdRequest) {
    // Verify it exists in household requests
    const requestRecord = await prisma.prayerPersonalRequest.findFirst({
      where: { id: requestId, spaceId: membership.spaceId },
    });
    if (!requestRecord) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    transactions.push(
      prisma.prayerPersonalRequest.update({
        where: { id: requestId },
        data,
      })
    );
  } else {
    // Verify it exists in family requests
    const requestRecord = await prisma.prayerFamilyRequest.findFirst({
      where: {
        id: requestId,
        family: { spaceId: membership.spaceId },
      },
    });
    if (!requestRecord) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    transactions.push(
      prisma.prayerFamilyRequest.update({
        where: { id: requestId },
        data,
      })
    );
  }

  // Update current user's profile
  transactions.push(
    prisma.userProfile.upsert({
      where: { appwriteUserId: userId },
      update: markAnswered
        ? {
            // Increment answeredPersonalCount for household requests, answeredFamilyCount for family-specific requests
            ...(isHouseholdRequest
              ? { answeredPersonalCount: { increment: 1 } }
              : { answeredFamilyCount: { increment: 1 } }),
            lastSeenAt: now,
          }
        : {
            lastSeenAt: now,
          },
      create: markAnswered
        ? {
            appwriteUserId: userId,
            displayName: membership.displayName,
            email: null,
            answeredFamilyCount: isHouseholdRequest ? 0 : 1,
            answeredPersonalCount: isHouseholdRequest ? 1 : 0,
            lastSeenAt: now,
          }
        : {
            appwriteUserId: userId,
            displayName: membership.displayName,
            email: null,
            lastSeenAt: now,
          },
    })
  );

  // Update profiles for all other members in the space when marking as answered
  if (markAnswered && spaceMembers.length > 0) {
    spaceMembers.forEach((member) => {
      if (member.appwriteUserId !== userId) {
        transactions.push(
          prisma.userProfile.upsert({
            where: { appwriteUserId: member.appwriteUserId },
            update: {
              // Increment answeredPersonalCount for household requests, answeredFamilyCount for family-specific requests
              ...(isHouseholdRequest
                ? { answeredPersonalCount: { increment: 1 } }
                : { answeredFamilyCount: { increment: 1 } }),
            },
            create: {
              appwriteUserId: member.appwriteUserId,
              displayName: member.displayName,
              email: null,
              answeredFamilyCount: isHouseholdRequest ? 0 : 1,
              answeredPersonalCount: isHouseholdRequest ? 1 : 0,
              lastSeenAt: now,
            },
          })
        );
      }
    });
  }

  const [updated] = await prisma.$transaction(transactions);

  return NextResponse.json(updated);
}

/**
 * DELETE /api/prayer-tracker/requests/[requestId]
 * Deletes a request - handles both types
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const userId = resolveUserId(request, body?.userId);
  const isHouseholdRequest = body?.isHouseholdRequest;

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  if (isHouseholdRequest) {
    const requestRecord = await prisma.prayerPersonalRequest.findFirst({
      where: { id: requestId, spaceId: membership.spaceId },
    });
    if (!requestRecord) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    await prisma.prayerPersonalRequest.delete({ where: { id: requestId } });
  } else {
    const requestRecord = await prisma.prayerFamilyRequest.findFirst({
      where: {
        id: requestId,
        family: { spaceId: membership.spaceId },
      },
    });
    if (!requestRecord) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    await prisma.prayerFamilyRequest.delete({ where: { id: requestId } });
  }

  return NextResponse.json({ ok: true });
}
