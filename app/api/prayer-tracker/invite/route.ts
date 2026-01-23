import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

function generateShareCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijklmnopqrstuvwxy123456789-*";
  let out = "";
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, regenerate } = body as { userId?: string; regenerate?: boolean };
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: authenticatedUserId },
    include: { space: true },
  });
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  let space = membership.space;
  if (regenerate) {
    space = await prisma.prayerFamilySpace.update({
      where: { id: space.id },
      data: { shareCode: generateShareCode() },
    });
  }

  return NextResponse.json({ shareCode: space.shareCode });
}

