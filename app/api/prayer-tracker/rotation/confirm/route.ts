import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, familyAssignments, personalIds } = body as {
    userId?: string;
    familyAssignments?: { familyId: string; prayedByMemberId?: string | null }[];
    personalIds?: string[];
  };
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const now = new Date();
  const transactions: Promise<unknown>[] = [];

  if (Array.isArray(familyAssignments) && familyAssignments.length) {
    familyAssignments.forEach(({ familyId, prayedByMemberId }) => {
      if (!familyId) return;
      transactions.push(
        prisma.prayerFamily.update({
          where: { id: familyId },
          data: {
            lastPrayedAt: now,
            lastPrayedByMemberId: prayedByMemberId || null,
          },
        })
      );
    });
  }

  if (Array.isArray(personalIds) && personalIds.length) {
    transactions.push(
      prisma.prayerPersonalRequest.updateMany({
        where: { id: { in: personalIds } },
        data: { lastPrayedAt: now },
      })
    );
  }

  if (transactions.length) {
    await prisma.$transaction(transactions);
  }

  await prisma.userProfile
    .update({
      where: { appwriteUserId: userId },
      data: { lastPrayerAt: now, lastSeenAt: now },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
