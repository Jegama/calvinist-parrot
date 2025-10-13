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

// PATCH: Rename space (owner only)
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, spaceId, spaceName } = body as { userId?: string; spaceId?: string; spaceName?: string };
  if (!userId || !spaceId || !spaceName) return NextResponse.json({ error: "Missing userId, spaceId, or spaceName" }, { status: 400 });

  // Only owner can rename
  const member = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId, spaceId } });
  if (!member || member.role !== "OWNER") return NextResponse.json({ error: "Only owner can rename" }, { status: 403 });

  const updated = await prisma.prayerFamilySpace.update({ where: { id: spaceId }, data: { spaceName: spaceName.trim() } });
  return NextResponse.json({ space: updated });
}

// DELETE: Leave or remove member (with owner transfer if needed)
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, spaceId, removeMemberId, transferToMemberId } = body as {
    userId?: string;
    spaceId?: string;
    removeMemberId?: string; // if owner is removing another member
    transferToMemberId?: string; // if owner is leaving, must transfer
  };
  if (!userId || !spaceId) return NextResponse.json({ error: "Missing userId or spaceId" }, { status: 400 });

  const member = await prisma.prayerMember.findFirst({ where: { appwriteUserId: userId, spaceId } });
  if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  // Owner removing another member
  if (removeMemberId && member.role === "OWNER") {
    if (removeMemberId === member.id) return NextResponse.json({ error: "Owner cannot remove self this way" }, { status: 400 });

    const targetMember = await prisma.prayerMember.findFirst({ where: { id: removeMemberId, spaceId } });
    if (!targetMember) return NextResponse.json({ error: "Member not found in this space" }, { status: 404 });

    await prisma.prayerMember.delete({ where: { id: targetMember.id } });
    return NextResponse.json({ success: true });
  }

  // Owner leaving: must transfer ownership
  if (member.role === "OWNER") {
    if (!transferToMemberId) return NextResponse.json({ error: "Must transfer ownership before leaving" }, { status: 400 });
    const targetMember = await prisma.prayerMember.findFirst({ where: { id: transferToMemberId, spaceId } });
    if (!targetMember) return NextResponse.json({ error: "Transfer target must be in this space" }, { status: 404 });

    await prisma.prayerMember.update({ where: { id: targetMember.id }, data: { role: "OWNER" } });
    await prisma.prayerMember.delete({ where: { id: member.id } });
    return NextResponse.json({ success: true, transferred: targetMember.id });
  }

  // Regular member leaving
  await prisma.prayerMember.delete({ where: { id: member.id } });
  return NextResponse.json({ success: true });
}
