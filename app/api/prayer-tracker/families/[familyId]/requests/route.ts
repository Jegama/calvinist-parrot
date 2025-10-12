import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type RouteContext = { params: Promise<{ familyId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const { familyId } = await context.params;

  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
    select: { spaceId: true },
  });
  if (!membership)
    return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const family = await prisma.prayerFamily.findFirst({
    where: { id: familyId, spaceId: membership.spaceId },
    select: { id: true },
  });
  if (!family) return NextResponse.json({ error: "Family not found" }, { status: 404 });

  const items = await prisma.prayerFamilyRequest.findMany({
    where: { familyId, status: { not: "ARCHIVED" } },
    orderBy: [{ dateUpdated: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(request: Request, context: RouteContext) {
  const { familyId } = await context.params;
  const body = await request.json().catch(() => ({}));
  type CreateFamilyRequestPayload = {
    userId?: string;
    requestText?: string;
    notes?: string | null;
    linkedScripture?: string | null;
  };

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const {
    userId,
    requestText,
    notes,
    linkedScripture,
  }: CreateFamilyRequestPayload = {
    userId: typeof payload.userId === "string" ? payload.userId : undefined,
    requestText: typeof payload.requestText === "string" ? payload.requestText : undefined,
    notes:
      typeof payload.notes === "string"
        ? payload.notes
        : payload.notes === null
        ? null
        : undefined,
    linkedScripture:
      typeof payload.linkedScripture === "string"
        ? payload.linkedScripture
        : payload.linkedScripture === null
        ? null
        : undefined,
  };
  if (!userId || !requestText)
    return NextResponse.json({ error: "Missing userId or requestText" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
    select: { spaceId: true },
  });
  if (!membership)
    return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const family = await prisma.prayerFamily.findFirst({
    where: { id: familyId, spaceId: membership.spaceId },
    select: { id: true },
  });
  if (!family) return NextResponse.json({ error: "Family not found" }, { status: 404 });

  const created = await prisma.prayerFamilyRequest.create({
    data: { familyId, requestText, notes: notes || null, linkedScripture: linkedScripture || null },
  });
  return NextResponse.json(created);
}

