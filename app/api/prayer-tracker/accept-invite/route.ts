import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, shareCode, displayName } = body as {
    userId?: string;
    shareCode?: string;
    displayName?: string;
  };
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!shareCode) return NextResponse.json({ error: "Missing shareCode" }, { status: 400 });

  const space = await prisma.prayerFamilySpace.findFirst({ where: { shareCode } });
  if (!space) return NextResponse.json({ error: "Invalid share code" }, { status: 404 });

  const existing = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: authenticatedUserId, spaceId: space.id },
  });
  if (existing) {
    await prisma.userProfile
      .update({
        where: { appwriteUserId: authenticatedUserId },
        data: { defaultSpaceId: space.id, lastSeenAt: new Date() },
      })
      .catch(() => null);
    return NextResponse.json({ space, membership: existing });
  }

  const member = await prisma.prayerMember.create({
    data: {
      spaceId: space.id,
      appwriteUserId: authenticatedUserId,
      displayName: displayName || "Spouse",
      role: "MEMBER",
    },
  });

  await prisma.userProfile
    .update({
      where: { appwriteUserId: authenticatedUserId },
      data: { defaultSpaceId: space.id, lastSeenAt: new Date() },
    })
    .catch(() => null);

  return NextResponse.json({ space, membership: member });
}
