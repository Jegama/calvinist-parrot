import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providedUserId = searchParams.get("userId") ?? undefined;
  const { userId, errorResponse } = await requireAuthenticatedUser(providedUserId);
  if (errorResponse || !userId) return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
  });
  if (!membership) return NextResponse.json([]);

  const families = await prisma.prayerFamily.findMany({
    where: { spaceId: membership.spaceId },
    include: {
      lastPrayedBy: {
        select: { id: true, displayName: true },
      },
    },
    orderBy: [
      { archivedAt: { sort: "asc", nulls: "first" } },
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
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!familyName) return NextResponse.json({ error: "Missing familyName" }, { status: 400 });
  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: authenticatedUserId } });
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
