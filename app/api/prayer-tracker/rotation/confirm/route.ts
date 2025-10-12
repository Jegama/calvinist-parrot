import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type FamilyAssignment = { familyId: string; prayedByMemberId?: string | null };

function resolveUserId(request: Request, body: { userId?: string }) {
  const bodyUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (bodyUserId) return bodyUserId;
  const { searchParams } = new URL(request.url);
  const queryUserId = searchParams.get("userId");
  return queryUserId?.trim() || undefined;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    familyAssignments?: FamilyAssignment[];
    personalIds?: string[];
  };
  const userId = resolveUserId(request, body);
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
    select: { id: true, spaceId: true },
  });
  if (!membership)
    return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const now = new Date();
  const transactions: Prisma.PrismaPromise<unknown>[] = [];

  const assignments = Array.isArray(body.familyAssignments)
    ? body.familyAssignments.filter((item): item is FamilyAssignment => Boolean(item?.familyId))
    : [];
  if (assignments.length) {
    const uniqueFamilyIds = Array.from(new Set(assignments.map((item) => item.familyId)));
    const families = await prisma.prayerFamily.findMany({
      where: { spaceId: membership.spaceId, id: { in: uniqueFamilyIds } },
      select: { id: true },
    });
    if (families.length !== uniqueFamilyIds.length)
      return NextResponse.json({ error: "Family not found in your space" }, { status: 404 });

    const prayedByIds = Array.from(
      new Set(
        assignments
          .map((item) => item.prayedByMemberId)
          .filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          )
      )
    );
    if (prayedByIds.length) {
      const members = await prisma.prayerMember.findMany({
        where: { spaceId: membership.spaceId, id: { in: prayedByIds } },
        select: { id: true },
      });
      if (members.length !== prayedByIds.length)
        return NextResponse.json({ error: "Invalid member assignment" }, { status: 400 });
    }

    assignments.forEach(({ familyId, prayedByMemberId }) => {
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

  const personalIds = Array.isArray(body.personalIds)
    ? Array.from(
        new Set(
          body.personalIds.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          )
        )
      )
    : [];
  if (personalIds.length) {
    const personal = await prisma.prayerPersonalRequest.findMany({
      where: { spaceId: membership.spaceId, id: { in: personalIds } },
      select: { id: true },
    });
    if (personal.length !== personalIds.length)
      return NextResponse.json({ error: "Personal request not found in your space" }, { status: 404 });

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
