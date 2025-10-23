import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const members = await prisma.prayerMember.findMany({
    where: { spaceId: membership.spaceId },
    orderBy: { joinedAt: "asc" },
    select: {
      id: true,
      displayName: true,
      appwriteUserId: true,
      role: true,
    },
  });

  const familyLimit = Math.max(2, members.length * 2);

  const families = await prisma.prayerFamily.findMany({
    where: { spaceId: membership.spaceId, archivedAt: null },
    include: {
      lastPrayedBy: {
        select: { id: true, displayName: true },
      },
      requests: {
        where: { status: "ACTIVE" },
        orderBy: [
          { lastPrayedAt: { sort: "asc", nulls: "first" } },
          { dateAdded: "asc" },
        ],
      },
    },
    orderBy: [
      { lastPrayedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ],
    take: familyLimit,
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const todaysPersonal = await prisma.prayerPersonalRequest.findMany({
    where: {
      spaceId: membership.spaceId,
      status: "ACTIVE",
      dateAdded: {
        gte: startOfToday,
        lte: endOfToday,
      },
    },
    orderBy: [{ dateAdded: "asc" }],
  });

  const excludeIds = todaysPersonal.map((item) => item.id);
  const extraPersonal = await prisma.prayerPersonalRequest.findMany({
    where: {
      spaceId: membership.spaceId,
      status: "ACTIVE",
      NOT: excludeIds.length ? { id: { in: excludeIds } } : undefined,
    },
    orderBy: [
      { lastPrayedAt: { sort: "asc", nulls: "first" } },
      { dateUpdated: "asc" },
    ],
    take: 5,
  });

  type PersonalItem = Awaited<ReturnType<typeof prisma.prayerPersonalRequest.findMany>>[number];
  const combinedPersonalMap = new Map<string, PersonalItem>();
  todaysPersonal.forEach((item) => combinedPersonalMap.set(item.id, item));
  extraPersonal.forEach((item) => {
    if (!combinedPersonalMap.has(item.id)) combinedPersonalMap.set(item.id, item);
  });
  let personal = Array.from(combinedPersonalMap.values());
  if (personal.length > 5) {
    personal = personal.slice(0, 5);
  }

  return NextResponse.json({ families, personal, members });
}
