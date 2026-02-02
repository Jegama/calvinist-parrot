// app/api/kids-discipleship/monthly-vision/route.ts
// GET: Returns monthly visions for a child (current + history)
// POST: Create/update vision for current month (upsert)
// PATCH: Update current month's vision (reject if month already passed)

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { assertHouseholdAccess } from "@/lib/householdService";

/**
 * Get current year-month string (e.g., "2026-01")
 */
function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check if a yearMonth is in the past
 */
function isPastMonth(yearMonth: string): boolean {
  const current = getCurrentYearMonth();
  return yearMonth < current;
}

/**
 * GET /api/kids-discipleship/monthly-vision
 * Query params: userId (required), memberId (required), yearMonth (optional)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const memberId = searchParams.get("memberId");
  const yearMonth = searchParams.get("yearMonth");

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

  // If specific yearMonth requested, return just that one
  if (yearMonth) {
    const vision = await prisma.discipleshipMonthlyVision.findUnique({
      where: {
        memberId_yearMonth: {
          memberId,
          yearMonth,
        },
      },
    });

    return NextResponse.json({
      vision: vision
        ? {
            ...vision,
            createdAt: vision.createdAt.toISOString(),
            updatedAt: vision.updatedAt.toISOString(),
            isEditable: !isPastMonth(vision.yearMonth),
          }
        : null,
    });
  }

  // Otherwise return all visions for this child (most recent first)
  const visions = await prisma.discipleshipMonthlyVision.findMany({
    where: { memberId },
    orderBy: { yearMonth: "desc" },
  });

  const currentYearMonth = getCurrentYearMonth();

  return NextResponse.json({
    currentYearMonth,
    visions: visions.map((v) => ({
      id: v.id,
      yearMonth: v.yearMonth,
      memoryVerse: v.memoryVerse,
      characterFocus: v.characterFocus,
      competencyFocus: v.competencyFocus,
      emphasize: v.emphasize,
      watchFor: v.watchFor,
      encourage: v.encourage,
      correct: v.correct,
      reviewNotes: v.reviewNotes,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
      isEditable: !isPastMonth(v.yearMonth),
    })),
  });
}

/**
 * POST /api/kids-discipleship/monthly-vision
 * Body: { userId, memberId, yearMonth?, ...vision fields }
 * If yearMonth not provided, uses current month
 * Uses upsert to create or update
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    userId,
    memberId,
    yearMonth: providedYearMonth,
    memoryVerse,
    characterFocus,
    competencyFocus,
    emphasize,
    watchFor,
    encourage,
    correct,
    reviewNotes,
  } = body;

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
    select: { spaceId: true, isChild: true },
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

  // Use current month if not provided
  const yearMonth = providedYearMonth || getCurrentYearMonth();

  // Cannot create/update past months
  if (isPastMonth(yearMonth)) {
    return NextResponse.json(
      { error: "Cannot modify past month visions" },
      { status: 400 }
    );
  }

  // Upsert the vision
  const vision = await prisma.discipleshipMonthlyVision.upsert({
    where: {
      memberId_yearMonth: {
        memberId,
        yearMonth,
      },
    },
    create: {
      memberId,
      yearMonth,
      memoryVerse,
      characterFocus,
      competencyFocus,
      emphasize,
      watchFor,
      encourage,
      correct,
      reviewNotes,
    },
    update: {
      memoryVerse,
      characterFocus,
      competencyFocus,
      emphasize,
      watchFor,
      encourage,
      correct,
      reviewNotes,
    },
  });

  return NextResponse.json({
    vision: {
      ...vision,
      createdAt: vision.createdAt.toISOString(),
      updatedAt: vision.updatedAt.toISOString(),
      isEditable: true,
    },
  });
}

/**
 * PATCH /api/kids-discipleship/monthly-vision
 * Body: { userId, visionId, ...fields to update }
 * Only allows updating current or future month visions
 */
export async function PATCH(request: Request) {
  const body = await request.json();
  const { userId, visionId, ...updates } = body;

  if (!userId || !visionId) {
    return NextResponse.json(
      { error: "Missing userId or visionId" },
      { status: 400 }
    );
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  // Get the vision and verify access
  const vision = await prisma.discipleshipMonthlyVision.findUnique({
    where: { id: visionId },
    include: {
      member: {
        select: { spaceId: true },
      },
    },
  });

  if (!vision) {
    return NextResponse.json({ error: "Vision not found" }, { status: 404 });
  }

  try {
    await assertHouseholdAccess(userId, vision.member.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check if the vision is for a past month (immutable)
  if (isPastMonth(vision.yearMonth)) {
    return NextResponse.json(
      { error: "Cannot edit past month visions" },
      { status: 400 }
    );
  }

  // Filter allowed update fields
  const allowedFields = [
    "memoryVerse",
    "characterFocus",
    "competencyFocus",
    "emphasize",
    "watchFor",
    "encourage",
    "correct",
    "reviewNotes",
  ];

  const filteredUpdates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in updates) {
      filteredUpdates[key] = updates[key];
    }
  }

  const updatedVision = await prisma.discipleshipMonthlyVision.update({
    where: { id: visionId },
    data: filteredUpdates,
  });

  return NextResponse.json({
    vision: {
      ...updatedVision,
      createdAt: updatedVision.createdAt.toISOString(),
      updatedAt: updatedVision.updatedAt.toISOString(),
      isEditable: true,
    },
  });
}
