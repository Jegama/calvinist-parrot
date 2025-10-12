import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function generateShareCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijklmnopqrstuvwxy123456789-*";
  let out = "";
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
    include: {
      space: {
        include: {
          members: {
            select: {
              id: true,
              displayName: true,
              appwriteUserId: true,
              role: true,
              joinedAt: true,
            },
            orderBy: { joinedAt: "asc" },
          },
        },
      },
    },
  });

  if (!membership) return NextResponse.json({ space: null, membership: null });
  return NextResponse.json({ space: membership.space, membership });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, displayName, spaceName } = body as {
    userId?: string;
    displayName?: string;
    spaceName?: string;
  };
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const existing = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
    include: { space: true },
  });
  if (existing) return NextResponse.json({ space: existing.space, membership: existing });

  const shareCode = generateShareCode();
  const resolvedSpaceName = spaceName?.trim()
    ? spaceName.trim()
    : `${displayName || "Family"}'s Prayer Space`;

  const space = await prisma.prayerFamilySpace.create({
    data: {
      shareCode,
      createdByUserId: userId,
      spaceName: resolvedSpaceName,
    },
  });

  const member = await prisma.prayerMember.create({
    data: {
      spaceId: space.id,
      appwriteUserId: userId,
      displayName: displayName || "You",
      role: "OWNER",
    },
  });

  await prisma.userProfile
    .update({
      where: { appwriteUserId: userId },
      data: { defaultSpaceId: space.id, lastSeenAt: new Date() },
    })
    .catch(() => null);

  return NextResponse.json({ space, membership: member });
}
