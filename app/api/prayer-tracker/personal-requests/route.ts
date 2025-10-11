import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json([]);

  const items = await prisma.prayerPersonalRequest.findMany({
    where: { spaceId: membership.spaceId, status: { not: "ARCHIVED" } },
    orderBy: [{ dateUpdated: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, requestText, notes, linkedScripture, requesterMemberId } = body as any;
  if (!userId || !requestText)
    return NextResponse.json({ error: "Missing userId or requestText" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const created = await prisma.prayerPersonalRequest.create({
    data: {
      spaceId: membership.spaceId,
      requestText,
      notes: notes || null,
      linkedScripture: linkedScripture || null,
      requesterMemberId: requesterMemberId || membership.id,
    },
  });
  return NextResponse.json(created);
}

