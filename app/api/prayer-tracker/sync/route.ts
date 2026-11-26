import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getHouseholdFirstNames } from "@/lib/householdService";

export async function GET() {
  const { userId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !userId) {
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
    select: { spaceId: true },
  });
  if (!membership) {
    return NextResponse.json(
      { version: null, spaceId: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { spaceId } = membership;

  const [
    space,
    familyAgg,
    familyRequestAgg,
    personalAgg,
    memberAgg,
    familyCount,
    familyRequestCount,
    personalCount,
    memberCount,
    firstNames,
  ] = await Promise.all([
    prisma.prayerFamilySpace.findUnique({
      where: { id: spaceId },
      select: { updatedAt: true },
    }),
    prisma.prayerFamily.aggregate({
      where: { spaceId },
      _max: { updatedAt: true, lastPrayedAt: true },
    }),
    prisma.prayerFamilyRequest.aggregate({
      where: { family: { spaceId } },
      _max: { dateUpdated: true, lastPrayedAt: true },
    }),
    prisma.prayerPersonalRequest.aggregate({
      where: { spaceId },
      _max: { dateUpdated: true, lastPrayedAt: true },
    }),
    prisma.prayerMember.aggregate({
      where: { spaceId },
      _max: { joinedAt: true, updatedAt: true },
    }),
    prisma.prayerFamily.count({ where: { spaceId } }),
    prisma.prayerFamilyRequest.count({ where: { family: { spaceId } } }),
    prisma.prayerPersonalRequest.count({ where: { spaceId } }),
    prisma.prayerMember.count({ where: { spaceId } }),
    getHouseholdFirstNames(spaceId),
  ]);

  if (!space) {
    return NextResponse.json(
      { spaceId: null, version: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const timestamps = [
    space.updatedAt,
    familyAgg._max.updatedAt,
    familyAgg._max.lastPrayedAt,
    familyRequestAgg._max.dateUpdated,
    familyRequestAgg._max.lastPrayedAt,
    personalAgg._max.dateUpdated,
    personalAgg._max.lastPrayedAt,
    memberAgg._max.joinedAt,
    memberAgg._max.updatedAt,
  ].filter((value): value is Date => value instanceof Date);

  const latest = timestamps.reduce<Date | null>(
    (acc, current) => (acc === null || current > acc ? current : acc),
    null
  );

  // Counts catch deletes that wouldn't move any MAX(timestamp).
  const version = [
    latest ? latest.toISOString() : "0",
    familyCount,
    familyRequestCount,
    personalCount,
    memberCount,
    // First names live on account profiles. Unrelated edits and last-seen updates
    // must not invalidate a household's prepared rotation.
    createHash("sha256").update(JSON.stringify([...firstNames])).digest("hex"),
  ].join(":");

  return NextResponse.json(
    { spaceId, version },
    { headers: { "Cache-Control": "no-store" } }
  );
}
