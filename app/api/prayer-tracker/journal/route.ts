import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

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
    userId?: string;
    entryText?: string;
    tags?: unknown;
  };

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { userId, entryText, tags }: CreateJournalEntryPayload = {
    userId: typeof payload.userId === "string" ? payload.userId : undefined,
    entryText: typeof payload.entryText === "string" ? payload.entryText : undefined,
    tags: payload.tags,
  };
  if (!userId || !entryText)
    return NextResponse.json({ error: "Missing userId or entryText" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
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

