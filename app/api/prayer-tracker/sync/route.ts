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

  const [space] = await prisma.$queryRaw<{ spaceId: string; version: bigint }[]>`
    SELECT member."spaceId", space.version
    FROM "prayerMember" AS member
    JOIN "prayerFamilySpace" AS space ON space.id = member."spaceId"
    WHERE member."appwriteUserId" = ${userId}
    LIMIT 1
  `;
  if (!space) {
    return NextResponse.json(
      { spaceId: null, version: null, nameVersion: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const firstNames = await getHouseholdFirstNames(space.spaceId);
  // Name edits refresh labels without invalidating the prepared assignments.
  const nameVersion = createHash("sha256").update(JSON.stringify([...firstNames])).digest("hex");

  return NextResponse.json(
    { spaceId: space.spaceId, version: space.version.toString(), nameVersion },
    { headers: { "Cache-Control": "no-store" } }
  );
}
