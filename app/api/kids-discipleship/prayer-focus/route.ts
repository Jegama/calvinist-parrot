// app/api/kids-discipleship/prayer-focus/route.ts
// GET: Derived prayer focus and praise items from recent logs

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { assertHouseholdAccess } from "@/lib/householdService";
import { derivePrayerFocus, getLogStats } from "@/utils/kids-discipleship/prayerFocus";

/**
 * GET /api/kids-discipleship/prayer-focus
 * Query params: userId, memberId, daysBack? (default 30)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const memberId = searchParams.get("memberId");
  const daysBack = Math.min(Math.max(parseInt(searchParams.get("daysBack") || "30", 10), 1), 365);

  if (!userId || !memberId) {
    return NextResponse.json(
      { error: "Missing userId or memberId" },
      { status: 400 }
    );
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  // Verify the child belongs to user's household
  const child = await prisma.prayerMember.findUnique({
    where: { id: memberId },
    select: { spaceId: true, isChild: true, displayName: true },
  });

  if (!child || !child.isChild) {
    return NextResponse.json(
      { error: "Child member not found" },
      { status: 404 }
    );
  }

  try {
    await assertHouseholdAccess(userId, child.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Get derived prayer focus
  const focus = await derivePrayerFocus(memberId, daysBack);

  // Get stats for dashboard
  const stats = await getLogStats(memberId, daysBack);

  return NextResponse.json({
    childName: child.displayName,
    daysBack,
    prayerNeeds: focus.prayerNeeds.map((item) => ({
      ...item,
      sourceEntryDate: item.sourceEntryDate.toISOString(),
    })),
    praises: focus.praises.map((item) => ({
      ...item,
      sourceEntryDate: item.sourceEntryDate.toISOString(),
    })),
    stats,
  });
}
