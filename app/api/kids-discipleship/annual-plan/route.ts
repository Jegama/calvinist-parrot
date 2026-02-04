// app/api/kids-discipleship/annual-plan/route.ts
// GET: Returns all annual plans for all children in household, grouped by child
// POST: Create new annual plan for child/year
// PATCH: Update current year's plan (reject if year already passed)

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { assertHouseholdAccess } from "@/lib/householdService";

/**
 * GET /api/kids-discipleship/annual-plan
 * Query params: userId (required), memberId (optional - filter to one child)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const memberId = searchParams.get("memberId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  // Get user's household
  const member = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
    select: { spaceId: true },
  });

  if (!member) {
    return NextResponse.json(
      { error: "No household found for user" },
      { status: 404 }
    );
  }

  // Get all children in the household
  const children = await prisma.prayerMember.findMany({
    where: {
      spaceId: member.spaceId,
      isChild: true,
      ...(memberId ? { id: memberId } : {}),
    },
    select: {
      id: true,
      displayName: true,
      birthdate: true,
      annualPlans: {
        orderBy: { year: "desc" },
      },
    },
  });

  // Group plans by child
  const result = children.map((child) => ({
    memberId: child.id,
    childName: child.displayName,
    birthdate: child.birthdate?.toISOString() ?? null,
    plans: child.annualPlans.map((plan) => ({
      id: plan.id,
      year: plan.year,
      characterGoal: plan.characterGoal,
      characterScripture: plan.characterScripture,
      characterAction: plan.characterAction,
      competencyGoal: plan.competencyGoal,
      competencyScripture: plan.competencyScripture,
      competencyAction: plan.competencyAction,
      competencyType: plan.competencyType,
      blessingsPlan: plan.blessingsPlan,
      consequencesPlan: plan.consequencesPlan,
      themeVerse: plan.themeVerse,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    })),
  }));

  return NextResponse.json({ children: result });
}

/**
 * POST /api/kids-discipleship/annual-plan
 * Body: { userId, memberId, year, characterGoal, competencyGoal, ... }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    userId,
    memberId,
    year,
    characterGoal,
    characterScripture,
    characterAction,
    competencyGoal,
    competencyScripture,
    competencyAction,
    competencyType,
    blessingsPlan,
    consequencesPlan,
    themeVerse,
  } = body;

  if (!userId || !memberId || !year || !characterGoal || !competencyGoal) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: userId, memberId, year, characterGoal, competencyGoal",
      },
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

  // Verify user has access to this household
  try {
    await assertHouseholdAccess(userId, child.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Create the annual plan
  const plan = await prisma.discipleshipAnnualPlan.create({
    data: {
      memberId,
      year,
      characterGoal,
      characterScripture,
      characterAction,
      competencyGoal,
      competencyScripture,
      competencyAction,
      competencyType: competencyType || "PERSONAL",
      blessingsPlan,
      consequencesPlan,
      themeVerse,
    },
  });

  return NextResponse.json({ plan }, { status: 201 });
}

/**
 * PATCH /api/kids-discipleship/annual-plan
 * Body: { userId, planId, ...fields to update }
 * Only allows updating current or future year plans
 */
export async function PATCH(request: Request) {
  const body = await request.json();
  const { userId, planId, ...updates } = body;

  if (!userId || !planId) {
    return NextResponse.json(
      { error: "Missing userId or planId" },
      { status: 400 }
    );
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  // Get the plan and verify access
  const plan = await prisma.discipleshipAnnualPlan.findUnique({
    where: { id: planId },
    include: {
      member: {
        select: { spaceId: true },
      },
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Verify user has access to this household
  try {
    await assertHouseholdAccess(userId, plan.member.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check if the plan is for a past year (immutable)
  const currentYear = new Date().getFullYear();
  if (plan.year < currentYear) {
    return NextResponse.json(
      { error: "Cannot edit past year plans" },
      { status: 400 }
    );
  }

  // Filter allowed update fields
  const allowedFields = [
    "characterGoal",
    "characterScripture",
    "characterAction",
    "competencyGoal",
    "competencyScripture",
    "competencyAction",
    "competencyType",
    "blessingsPlan",
    "consequencesPlan",
    "themeVerse",
  ];

  const filteredUpdates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in updates) {
      filteredUpdates[key] = updates[key];
    }
  }

  const updatedPlan = await prisma.discipleshipAnnualPlan.update({
    where: { id: planId },
    data: filteredUpdates,
  });

  return NextResponse.json({ plan: updatedPlan });
}
