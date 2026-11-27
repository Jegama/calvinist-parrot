import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { bumpSpaceVersion } from "@/lib/householdService";
import { requireAuthenticatedUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ requestId: string }> };

/**
 * PATCH /api/prayer-tracker/requests/[requestId]
 * Updates a request - handles both prayerPersonalRequest and prayerFamilyRequest
 * Supports moving requests between tables when linkedToFamily changes
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    requestText?: string;
    notes?: string | null;
    lastPrayedAt?: string | null;
    status?: "ACTIVE" | "ANSWERED" | "ARCHIVED";
    markAnswered?: boolean;
    isHouseholdRequest?: boolean; // Current table location
    linkedToFamily?: string; // New family assignment (if changed)
    originalLinkedToFamily?: string; // Original family assignment
  };
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const {
    requestText,
    notes,
    lastPrayedAt,
    status,
    markAnswered,
    isHouseholdRequest,
    linkedToFamily,
    originalLinkedToFamily,
  } = body;

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: authenticatedUserId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const now = new Date();

  // Check if family assignment changed - if so, need to move between tables
  const familyChanged =
    linkedToFamily !== undefined && originalLinkedToFamily !== undefined && linkedToFamily !== originalLinkedToFamily;

  if (familyChanged) {
    const destination = linkedToFamily === "household" ? null : await prisma.prayerFamily.findFirst({
      where: { id: linkedToFamily, spaceId: membership.spaceId },
      select: { id: true, familyName: true },
    });
    if (linkedToFamily !== "household" && !destination) {
      return NextResponse.json({ error: "Family not found in your space" }, { status: 404 });
    }

    // Copy the row returned by DELETE so a concurrent edit is included in the move.
    const created = await prisma.$transaction(async (tx) => {
      // Journal deletion locks the entry before clearing its request links. Use that
      // same order when carrying a link to the destination request.
      const wasHousehold = originalLinkedToFamily === "household";
      const sourceLink = wasHousehold
        ? Prisma.sql`SELECT "linkedJournalEntryId" FROM "prayerPersonalRequest"
            WHERE id = ${requestId} AND "spaceId" = ${membership.spaceId}`
        : Prisma.sql`SELECT request."linkedJournalEntryId" FROM "prayerFamilyRequest" AS request
            JOIN "prayerFamily" AS family ON family.id = request."familyId"
            WHERE request.id = ${requestId} AND family."spaceId" = ${membership.spaceId}`;
      await tx.$queryRaw`SELECT id FROM "journalEntry" WHERE id = (${sourceLink}) FOR KEY SHARE`;
      const previous = wasHousehold
        ? await tx.prayerPersonalRequest.delete({
            where: { id: requestId, spaceId: membership.spaceId },
          })
        : await tx.prayerFamilyRequest.delete({
            where: { id: requestId, family: { spaceId: membership.spaceId } },
          });
      const data = {
        requestText: typeof requestText === "string" && requestText.trim() ? requestText.trim() : previous.requestText,
        notes: notes !== undefined ? (notes ? notes.trim() : null) : previous.notes,
        linkedScripture: previous.linkedScripture,
        linkedJournalEntryId: previous.linkedJournalEntryId,
        dateAdded: previous.dateAdded,
        status: previous.status,
        lastPrayedAt: previous.lastPrayedAt,
        answeredAt: previous.answeredAt,
      };
      const moved = destination
        ? await tx.prayerFamilyRequest.create({ data: { ...data, familyId: destination.id } })
        : await tx.prayerPersonalRequest.create({
            data: { ...data, spaceId: membership.spaceId, requesterMemberId: membership.id },
          });
      await bumpSpaceVersion(tx, membership.spaceId);
      return moved;
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    });
    if (!created) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    return NextResponse.json({
      id: created.id,
      requestText: created.requestText,
      notes: created.notes,
      linkedScripture: created.linkedScripture,
      lastPrayedAt: created.lastPrayedAt?.toISOString() || null,
      dateAdded: created.dateAdded.toISOString(),
      status: created.status,
      answeredAt: created.answeredAt?.toISOString() || null,
      familyId: destination?.id ?? null,
      familyName: destination?.familyName ?? null,
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
  if (lastPrayedAt !== undefined) {
    data.lastPrayedAt = lastPrayedAt ? new Date(lastPrayedAt) : null;
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
        select: { appwriteUserId: true },
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

  // Journal deletion also locks prayer rows, their household, then the author profile.
  transactions.push(bumpSpaceVersion(prisma, membership.spaceId));

  // A missing profile uses the same recoverable placeholder as other background writes.
  // Account sync replaces it on sign-in, preserving independent household labels.
  transactions.push(
    prisma.userProfile.upsert({
      where: { appwriteUserId: authenticatedUserId },
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
      create: {
        appwriteUserId: authenticatedUserId,
        displayName: "User",
        answeredFamilyCount: markAnswered && !isHouseholdRequest ? 1 : 0,
        answeredPersonalCount: markAnswered && isHouseholdRequest ? 1 : 0,
        lastSeenAt: now,
      },
    })
  );

  // Update profiles for all other members in the space when marking as answered
  if (markAnswered && spaceMembers.length > 0) {
    spaceMembers.forEach((member) => {
      if (!member.appwriteUserId || member.appwriteUserId === authenticatedUserId) {
        return;
      }

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
            displayName: "User",
            email: null,
            answeredFamilyCount: isHouseholdRequest ? 0 : 1,
            answeredPersonalCount: isHouseholdRequest ? 1 : 0,
            lastSeenAt: now,
          },
        })
      );
    });
  }

  if (markAnswered === true) {
    // Lock before updating so simultaneous clicks and replays count a single
    // transition. Reopening the request makes a subsequent answer eligible again.
    const source = isHouseholdRequest ? Prisma.sql`"prayerPersonalRequest"` : Prisma.sql`"prayerFamilyRequest"`;
    const receipt = prisma.$executeRaw`
      WITH previous AS (SELECT status FROM ${source} WHERE id = ${requestId} FOR UPDATE)
      INSERT INTO "AnalyticsEngagementEvent" (feature, step, channel, "flowId")
      SELECT 'prayer', 'request_answered', 'web', ${crypto.randomUUID()} FROM previous
      WHERE status <> 'ANSWERED'
    `;
    const [, updated] = await prisma.$transaction([receipt, ...transactions]);
    return NextResponse.json(updated);
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
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isHouseholdRequest = body?.isHouseholdRequest;

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: authenticatedUserId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const deleted = await prisma.$transaction(async (tx) => {
    const { count } = isHouseholdRequest
      ? await tx.prayerPersonalRequest.deleteMany({ where: { id: requestId, spaceId: membership.spaceId } })
      : await tx.prayerFamilyRequest.deleteMany({ where: { id: requestId, family: { spaceId: membership.spaceId } } });
    if (count) await bumpSpaceVersion(tx, membership.spaceId);
    return count;
  });
  if (!deleted) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
