import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  DEFAULT_ADULT_CAPACITY,
  DEFAULT_CHILD_CAPACITY,
  MIN_FAMILY_LIMIT,
  MAX_PERSONAL_REQUESTS_PER_ROTATION,
} from "@/app/prayer-tracker/constants";
import { requireAuthenticatedUser } from "@/lib/auth";
import { assignFamilies } from "./assign-families";

export async function GET(request: Request) {
  void request;
  const { userId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !userId) return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const members = await prisma.prayerMember.findMany({
    where: { spaceId: membership.spaceId },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      displayName: true,
      appwriteUserId: true,
      role: true,
      assignmentCapacity: true,
      assignmentCount: true,
      isChild: true,
      birthdate: true,
    },
  });
  const capacities = members.map((member) => ({
    id: member.id,
    capacity: Math.max(
      0,
      member.assignmentCapacity ?? (member.isChild ? DEFAULT_CHILD_CAPACITY : DEFAULT_ADULT_CAPACITY),
    ),
  }));
  const totalCapacity = capacities.reduce((sum, member) => sum + member.capacity, 0);
  const familyLimit = Math.max(MIN_FAMILY_LIMIT, totalCapacity || members.length * DEFAULT_ADULT_CAPACITY);

  const families = await prisma.prayerFamily.findMany({
    where: { spaceId: membership.spaceId, archivedAt: null },
    include: {
      lastPrayedBy: {
        select: { id: true, displayName: true },
      },
      requests: {
        where: { status: "ACTIVE" },
        orderBy: [{ lastPrayedAt: { sort: "asc", nulls: "first" } }, { dateAdded: "asc" }],
      },
    },
    orderBy: [{ lastPrayedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }, { id: "asc" }],
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
    orderBy: [{ lastPrayedAt: { sort: "asc", nulls: "first" } }, { dateUpdated: "asc" }],
    take: MAX_PERSONAL_REQUESTS_PER_ROTATION,
  });

  type PersonalItem = Awaited<ReturnType<typeof prisma.prayerPersonalRequest.findMany>>[number];
  const combinedPersonalMap = new Map<string, PersonalItem>();
  todaysPersonal.forEach((item) => combinedPersonalMap.set(item.id, item));
  extraPersonal.forEach((item) => {
    if (!combinedPersonalMap.has(item.id)) combinedPersonalMap.set(item.id, item);
  });
  let personal = Array.from(combinedPersonalMap.values());
  if (personal.length > MAX_PERSONAL_REQUESTS_PER_ROTATION) {
    personal = personal.slice(0, MAX_PERSONAL_REQUESTS_PER_ROTATION);
  }

  const assignments = assignFamilies(families, capacities);
  return NextResponse.json({ families, personal, members, assignments });
}
