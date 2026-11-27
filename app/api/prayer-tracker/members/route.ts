import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { DEFAULT_ADULT_CAPACITY, DEFAULT_CHILD_CAPACITY } from "@/app/prayer-tracker/constants";
import { parseBirthdate } from "@/utils/ageUtils";
import { requireAuthenticatedUser } from "@/lib/auth";
import { bumpSpaceVersion, getHouseholdFirstNames, withHouseholdName } from "@/lib/householdService";

function parseIntOrFallback(value: unknown, fallback: number) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : fallback;
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    displayName,
    assignmentCapacity,
    isChild = true,
    birthdate,
  }: { displayName?: string; assignmentCapacity?: number; isChild?: boolean; birthdate?: string } = body;

  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse) return errorResponse;

  if (!displayName || !displayName.trim())
    return NextResponse.json({ error: "Display name is required" }, { status: 400 });

  // Validate birthdate if provided
  let parsedBirthdate: Date | null = null;
  if (birthdate) {
    parsedBirthdate = parseBirthdate(birthdate);
    if (!parsedBirthdate) {
      return NextResponse.json({ error: "Invalid birthdate format. Use ISO 8601 (YYYY-MM-DD)." }, { status: 400 });
    }
  }

  const actingMember = await prisma.prayerMember.findFirst({ where: { appwriteUserId: authenticatedUserId } });
  if (!actingMember) return NextResponse.json({ error: "No family space found" }, { status: 404 });
  if (actingMember.role !== "OWNER")
    return NextResponse.json({ error: "Only the owner can add members" }, { status: 403 });

  const capacity = parseIntOrFallback(assignmentCapacity, isChild ? DEFAULT_CHILD_CAPACITY : DEFAULT_ADULT_CAPACITY);

  const [member] = await prisma.$transaction([
    prisma.prayerMember.create({
      data: {
        spaceId: actingMember.spaceId,
        displayName: displayName.trim(),
        appwriteUserId: null,
        role: "MEMBER",
        isChild: Boolean(isChild),
        birthdate: parsedBirthdate,
        assignmentCapacity: capacity,
        assignmentCount: 0,
      },
    }),
    bumpSpaceVersion(prisma, actingMember.spaceId),
  ]);

  return NextResponse.json(member, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    memberId,
    displayName,
    assignmentCapacity,
    isChild,
    birthdate,
  }: { memberId?: string; displayName?: string; assignmentCapacity?: number; isChild?: boolean; birthdate?: string | null } =
    body;

  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse) return errorResponse;

  if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });

  const actingMember = await prisma.prayerMember.findFirst({ where: { appwriteUserId: authenticatedUserId } });
  if (!actingMember) return NextResponse.json({ error: "No family space found" }, { status: 404 });
  if (actingMember.role !== "OWNER")
    return NextResponse.json({ error: "Only the owner can update members" }, { status: 403 });

  const target = await prisma.prayerMember.findFirst({ where: { id: memberId, spaceId: actingMember.spaceId } });
  if (!target) return NextResponse.json({ error: "Member not found in your space" }, { status: 404 });

  const data: Record<string, unknown> = {};
  const name = typeof displayName === "string" ? displayName.trim() : undefined;
  if (name && name !== target.displayName) data.displayName = name;
  if (typeof isChild === "boolean" && isChild !== target.isChild) data.isChild = isChild;
  if (assignmentCapacity !== undefined) {
    const capacity = parseIntOrFallback(assignmentCapacity, target.assignmentCapacity);
    if (capacity !== target.assignmentCapacity) data.assignmentCapacity = capacity;
  }

  // Handle birthdate update (can be set to null to clear)
  if (birthdate !== undefined) {
    if (birthdate === null) {
      if (target.birthdate !== null) data.birthdate = null;
    } else if (typeof birthdate === "string") {
      const parsedBirthdate = parseBirthdate(birthdate);
      if (!parsedBirthdate) {
        return NextResponse.json({ error: "Invalid birthdate format. Use ISO 8601 (YYYY-MM-DD)." }, { status: 400 });
      }
      if (parsedBirthdate.getTime() !== target.birthdate?.getTime()) data.birthdate = parsedBirthdate;
    }
  }

  let updated = target;
  if (Object.keys(data).length > 0) {
    [updated] = await prisma.$transaction([
      prisma.prayerMember.update({ where: { id: memberId }, data }),
      bumpSpaceVersion(prisma, actingMember.spaceId),
    ]);
  }
  if (!updated.appwriteUserId) return NextResponse.json(updated);
  return NextResponse.json(withHouseholdName(updated, await getHouseholdFirstNames(actingMember.spaceId)));
}
