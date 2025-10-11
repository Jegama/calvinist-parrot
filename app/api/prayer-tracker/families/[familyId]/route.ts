import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type Params = { params: { familyId: string } };

async function getMembership(userId?: string) {
  if (!userId) return null;
  return prisma.prayerMember.findFirst({ where: { appwriteUserId: userId } });
}

function resolveUserId(request: Request, bodyUserId?: string) {
  if (bodyUserId && bodyUserId.trim().length) return bodyUserId.trim();
  const { searchParams } = new URL(request.url);
  const queryUserId = searchParams.get("userId");
  return queryUserId ?? undefined;
}

export async function PATCH(request: Request, { params }: Params) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    familyName?: string;
    parents?: string;
    children?: string[];
    categoryTag?: string | null;
    archive?: boolean;
    unarchive?: boolean;
  };
  const userId = resolveUserId(request, body.userId);
  const { familyName, parents, children, categoryTag, archive, unarchive } = body;

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const family = await prisma.prayerFamily.findFirst({
    where: { id: params.familyId, spaceId: membership.spaceId },
  });

  if (!family) return NextResponse.json({ error: "Family not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof familyName === "string" && familyName.trim().length) data.familyName = familyName.trim();
  if (typeof parents === "string") data.parents = parents.trim();
  if (Array.isArray(children)) data.children = children;
  if (categoryTag !== undefined) data.categoryTag = categoryTag ? categoryTag.trim() : null;
  if (archive) data.archivedAt = new Date();
  if (unarchive) data.archivedAt = null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const updated = await prisma.prayerFamily.update({
    where: { id: params.familyId },
    data,
    include: {
      lastPrayedBy: { select: { id: true, displayName: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: Params) {
  let userId: string | undefined;
  try {
    const body = (await request.json()) as { userId?: string };
    userId = resolveUserId(request, body?.userId);
  } catch {
    userId = resolveUserId(request, undefined);
  }

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const family = await prisma.prayerFamily.findFirst({
    where: { id: params.familyId, spaceId: membership.spaceId },
  });
  if (!family) return NextResponse.json({ error: "Family not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.prayerFamilyRequest.deleteMany({ where: { familyId: params.familyId } }),
    prisma.prayerFamily.delete({ where: { id: params.familyId } }),
  ]);

  return NextResponse.json({ ok: true });
}
