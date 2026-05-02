import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  void request;
  const { userId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !userId) return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
  if (!membership) return NextResponse.json([]);

  const entries = await prisma.prayerJournalEntry.findMany({
    where: { spaceId: membership.spaceId },
    orderBy: [{ entryDate: "desc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  type CreateJournalEntryPayload = {
    entryText?: string;
    tags?: unknown;
  };

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { entryText, tags }: CreateJournalEntryPayload = {
    entryText: typeof payload.entryText === "string" ? payload.entryText : undefined,
    tags: payload.tags,
  };
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!entryText)
    return NextResponse.json({ error: "Missing entryText" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: authenticatedUserId } });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const created = await prisma.prayerJournalEntry.create({
    data: {
      spaceId: membership.spaceId,
      entryText,
      tags: Array.isArray(tags)
        ? tags.filter((tag): tag is string => typeof tag === "string")
        : [],
    },
  });
  return NextResponse.json(created);
}

