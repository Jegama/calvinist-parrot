import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  DEFAULT_ADULT_CAPACITY,
  MIN_FAMILY_LIMIT,
  MAX_PERSONAL_REQUESTS_PER_ROTATION,
} from "@/app/prayer-tracker/constants";

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
      assignmentCapacity: true,
      assignmentCount: true,
      isChild: true,
    },
  });
  const totalCapacity = members.reduce((sum, member) => {
    const capacity = member.assignmentCapacity ?? (member.isChild ? 1 : DEFAULT_ADULT_CAPACITY);
    return sum + Math.max(0, capacity);
  }, 0);
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
    orderBy: [{ lastPrayedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
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

  const memberOrder = members.map((member) => member.id);
  const currentLoads = members.reduce<Record<string, number>>((acc, member) => {
    acc[member.id] = 0;
    return acc;
  }, {});

  const assignments: Record<string, string> = {};

  families.forEach((family) => {
    const capacityAwareMembers = members.map((member) => ({
      ...member,
      capacity: Math.max(0, member.assignmentCapacity ?? (member.isChild ? 1 : DEFAULT_ADULT_CAPACITY)),
      load: currentLoads[member.id] ?? 0,
    }));

    const eligible = capacityAwareMembers.filter((member) => member.capacity > 0);
    if (!eligible.length) {
      assignments[family.id] = "skip";
      return;
    }

    // Filter to those under capacity first
    const underCapacity = eligible.filter((member) => member.load < member.capacity);
    const selectionPool = underCapacity.length ? underCapacity : eligible;

    // Sort by load (lowest first), then by non-repeating preference, then by member order
    selectionPool.sort((a, b) => {
      const loadDiff = a.load - b.load;
      if (loadDiff !== 0) return loadDiff;

      // Prefer not repeating if loads are equal
      const aRepeats = a.id === family.lastPrayedByMemberId ? 1 : 0;
      const bRepeats = b.id === family.lastPrayedByMemberId ? 1 : 0;
      if (aRepeats !== bRepeats) return aRepeats - bRepeats;

      const remainingA = a.capacity - a.load;
      const remainingB = b.capacity - b.load;
      if (remainingA !== remainingB) return remainingB - remainingA;

      return memberOrder.indexOf(a.id) - memberOrder.indexOf(b.id);
    });

    const chosen = selectionPool[0];
    if (chosen) {
      assignments[family.id] = chosen.id;
      currentLoads[chosen.id] = (currentLoads[chosen.id] ?? 0) + 1;
    }
  });

  return NextResponse.json({ families, personal, members, assignments });
}
