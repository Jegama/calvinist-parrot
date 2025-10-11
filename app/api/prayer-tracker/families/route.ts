import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
  });
  if (!membership) return NextResponse.json([]);

  const families = await prisma.prayerFamily.findMany({
    where: { spaceId: membership.spaceId, archivedAt: null },
    include: {
      lastPrayedBy: {
        select: { id: true, displayName: true },
      },
    },
    orderBy: [
      { lastPrayedAt: { sort: "asc", nulls: "first" } },
      { familyName: "asc" },
    ],
  });
  return NextResponse.json(families);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, familyName, parents, children, categoryTag } = body as {
    userId?: string;
    familyName?: string;
    parents?: string;
    children?: string[];
    categoryTag?: string;
  };
  if (!userId || !familyName)
    return NextResponse.json({ error: "Missing userId or familyName" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const fam = await prisma.prayerFamily.create({
    data: {
      spaceId: membership.spaceId,
      familyName,
      parents: parents || "",
      children: Array.isArray(children) ? children : [],
      categoryTag: categoryTag?.trim() || null,
    },
  });
  return NextResponse.json(fam);
}
