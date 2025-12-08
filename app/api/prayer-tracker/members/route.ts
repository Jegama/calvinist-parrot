import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { DEFAULT_ADULT_CAPACITY, DEFAULT_CHILD_CAPACITY } from "@/app/prayer-tracker/constants";

function parseIntOrFallback(value: unknown, fallback: number) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : fallback;
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    userId,
    displayName,
    assignmentCapacity,
    isChild = true,
  }: { userId?: string; displayName?: string; assignmentCapacity?: number; isChild?: boolean } = body;

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  if (!displayName || !displayName.trim())
    return NextResponse.json({ error: "Display name is required" }, { status: 400 });

  const actingMember = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!actingMember) return NextResponse.json({ error: "No family space found" }, { status: 404 });
  if (actingMember.role !== "OWNER")
    return NextResponse.json({ error: "Only the owner can add members" }, { status: 403 });

  const capacity = parseIntOrFallback(assignmentCapacity, isChild ? DEFAULT_CHILD_CAPACITY : DEFAULT_ADULT_CAPACITY);

  const member = await prisma.prayerMember.create({
    data: {
      spaceId: actingMember.spaceId,
      displayName: displayName.trim(),
      appwriteUserId: null,
      role: "MEMBER",
      isChild: Boolean(isChild),
      assignmentCapacity: capacity,
      assignmentCount: 0,
    },
  });

  return NextResponse.json(member, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    userId,
    memberId,
    displayName,
    assignmentCapacity,
    isChild,
  }: { userId?: string; memberId?: string; displayName?: string; assignmentCapacity?: number; isChild?: boolean } =
    body;

  if (!userId || !memberId) return NextResponse.json({ error: "Missing userId or memberId" }, { status: 400 });

  const actingMember = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!actingMember) return NextResponse.json({ error: "No family space found" }, { status: 404 });
  if (actingMember.role !== "OWNER")
    return NextResponse.json({ error: "Only the owner can update members" }, { status: 403 });

  const target = await prisma.prayerMember.findFirst({ where: { id: memberId, spaceId: actingMember.spaceId } });
  if (!target) return NextResponse.json({ error: "Member not found in your space" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof displayName === "string" && displayName.trim()) data.displayName = displayName.trim();
  if (typeof isChild === "boolean") data.isChild = isChild;
  if (assignmentCapacity !== undefined)
    data.assignmentCapacity = parseIntOrFallback(assignmentCapacity, target.assignmentCapacity);

  if (!Object.keys(data).length) return NextResponse.json(target);

  const updated = await prisma.prayerMember.update({ where: { id: memberId }, data });
  return NextResponse.json(updated);
}
