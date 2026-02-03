// app/api/prayer-tracker/spaces/delete-household/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

/**
 * DELETE: Permanently delete entire household and all related data
 * Only available when the user is the sole adult with an account in the household
 */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, spaceId } = body as {
    userId?: string;
    spaceId?: string;
  };

  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse || !authenticatedUserId) {
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!spaceId) {
    return NextResponse.json({ error: "Missing spaceId" }, { status: 400 });
  }

  // Verify user is a member and owner
  const member = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: authenticatedUserId, spaceId },
  });
  if (!member) {
    return NextResponse.json({ error: "Not a member of this space" }, { status: 403 });
  }
  if (member.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can delete the household" }, { status: 403 });
  }

  // Check that there's only one adult with an account
  const adultAccountMembers = await prisma.prayerMember.findMany({
    where: {
      spaceId,
      appwriteUserId: { not: null },
      isChild: false,
    },
  });

  if (adultAccountMembers.length > 1) {
    return NextResponse.json(
      { error: "Cannot delete household with multiple adult members. Other adults must leave first." },
      { status: 400 }
    );
  }

  // Perform cascading deletion in a transaction
  // Order matters: delete children first, then parents
  try {
    await prisma.$transaction(async (tx) => {
      // Get all family IDs in this space
      const families = await tx.prayerFamily.findMany({
        where: { spaceId },
        select: { id: true },
      });
      const familyIds = families.map((f) => f.id);

      // Get all member IDs in this space
      const members = await tx.prayerMember.findMany({
        where: { spaceId },
        select: { id: true },
      });
      const memberIds = members.map((m) => m.id);

      // Get all journal entry IDs in this space
      const journalEntries = await tx.journalEntry.findMany({
        where: { spaceId },
        select: { id: true },
      });
      const journalEntryIds = journalEntries.map((j) => j.id);

      // 1. Delete journalEntryAI (child of journalEntry)
      if (journalEntryIds.length > 0) {
        await tx.journalEntryAI.deleteMany({
          where: { entryId: { in: journalEntryIds } },
        });
      }

      // 2. Delete journalEntry
      await tx.journalEntry.deleteMany({
        where: { spaceId },
      });

      // 3. Delete prayerJournalEntry (old journal entries)
      await tx.prayerJournalEntry.deleteMany({
        where: { spaceId },
      });

      // 4. Delete prayerFamilyRequest (child of prayerFamily)
      if (familyIds.length > 0) {
        await tx.prayerFamilyRequest.deleteMany({
          where: { familyId: { in: familyIds } },
        });
      }

      // 5. Delete prayerFamily
      await tx.prayerFamily.deleteMany({
        where: { spaceId },
      });

      // 6. Delete prayerPersonalRequest
      await tx.prayerPersonalRequest.deleteMany({
        where: { spaceId },
      });

      // 7. Delete discipleshipMonthlyVision (child of prayerMember)
      if (memberIds.length > 0) {
        await tx.discipleshipMonthlyVision.deleteMany({
          where: { memberId: { in: memberIds } },
        });
      }

      // 8. Delete discipleshipAnnualPlan (child of prayerMember)
      if (memberIds.length > 0) {
        await tx.discipleshipAnnualPlan.deleteMany({
          where: { memberId: { in: memberIds } },
        });
      }

      // 9. Delete prayerMember
      await tx.prayerMember.deleteMany({
        where: { spaceId },
      });

      // 10. Clear defaultSpaceId from any userProfile referencing this space
      await tx.userProfile.updateMany({
        where: { defaultSpaceId: spaceId },
        data: { defaultSpaceId: null },
      });

      // 11. Finally, delete the prayerFamilySpace itself
      await tx.prayerFamilySpace.delete({
        where: { id: spaceId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete household:", error);
    return NextResponse.json(
      { error: "Failed to delete household. Please try again." },
      { status: 500 }
    );
  }
}
