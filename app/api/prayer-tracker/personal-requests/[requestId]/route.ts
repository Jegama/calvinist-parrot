import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type RouteContext = { params: Promise<{ requestId: string }> };

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

export async function PATCH(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    requestText?: string;
    notes?: string | null;
    status?: "ACTIVE" | "ANSWERED" | "ARCHIVED";
    markAnswered?: boolean;
  };
  const userId = resolveUserId(request, body.userId);
  const { requestText, notes, status, markAnswered } = body;

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const membership = await getMembership(userId);
  if (!membership) return NextResponse.json({ error: "No family space found" }, { status: 404 });

  const requestRecord = await prisma.prayerPersonalRequest.findFirst({
    where: { id: requestId, spaceId: membership.spaceId },
  });
  if (!requestRecord) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const now = new Date();
  const data: Record<string, unknown> = {};

  if (typeof requestText === "string" && requestText.trim().length) {
    data.requestText = requestText.trim();
  }
  if (notes !== undefined) {
    data.notes = notes ? notes.trim() : null;
  }

  if (status && status !== requestRecord.status) {
    data.status = status;
    if (status === "ACTIVE") {
      data.answeredAt = null;
    }
  }

  if (markAnswered) {
    data.status = "ANSWERED";
    data.answeredAt = now;
    data.lastPrayedAt = now;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const profileTransaction = prisma.userProfile.upsert({
    where: { appwriteUserId: userId },
    update: markAnswered
      ? {
          answeredFamilyCount: { increment: 1 },
          answeredPersonalCount: { increment: 1 },
          lastSeenAt: now,
        }
      : {
          lastSeenAt: now,
        },
    create: markAnswered
      ? {
          appwriteUserId: userId,
          displayName: membership.displayName,
          email: null,
          answeredFamilyCount: 1,
          answeredPersonalCount: 1,
          lastSeenAt: now,
        }
      : {
          appwriteUserId: userId,
          displayName: membership.displayName,
          email: null,
          lastSeenAt: now,
        },
  });

  const [updated] = await prisma.$transaction([
    prisma.prayerPersonalRequest.update({
      where: { id: requestId },
      data,
    }),
    profileTransaction,
  ]);

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
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

  const requestRecord = await prisma.prayerPersonalRequest.findFirst({
    where: { id: requestId, spaceId: membership.spaceId },
  });
  if (!requestRecord) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  await prisma.prayerPersonalRequest.delete({ where: { id: requestId } });

  return NextResponse.json({ ok: true });
}

