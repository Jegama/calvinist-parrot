// app/api/kids-discipleship/progression-state/route.ts
// API endpoint to check what sections should be visible for progressive disclosure

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providedUserId = searchParams.get("userId") ?? undefined;
  const memberId = searchParams.get("memberId");

  const { userId, errorResponse } = await requireAuthenticatedUser(providedUserId);
  if (errorResponse || !userId) {
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!memberId) {
    return NextResponse.json({ error: "Missing memberId" }, { status: 400 });
  }

  // Security: Verify the user is a member of the household containing this child
  const childMember = await prisma.prayerMember.findUnique({
    where: { id: memberId },
    select: { spaceId: true, isChild: true },
  });

  if (!childMember) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  if (!childMember.isChild) {
    return NextResponse.json({ error: "Invalid memberId: not a child" }, { status: 400 });
  }

  // Verify authenticated user is a member of the same household
  const userMembership = await prisma.prayerMember.findFirst({
    where: {
      appwriteUserId: userId,
      spaceId: childMember.spaceId,
    },
  });

  if (!userMembership) {
    return NextResponse.json({ error: "Unauthorized: not a member of this household" }, { status: 403 });
  }

  // Check if annual plan exists for current year
  const currentYear = new Date().getFullYear();
  const annualPlan = await prisma.discipleshipAnnualPlan.findUnique({
    where: {
      memberId_year: {
        memberId,
        year: currentYear,
      },
    },
    select: { id: true },
  });

  // Check if monthly vision exists for current month
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthlyVision = await prisma.discipleshipMonthlyVision.findUnique({
    where: {
      memberId_yearMonth: {
        memberId,
        yearMonth,
      },
    },
    select: { id: true },
  });

  // Check if any logs exist for this child
  const logCount = await prisma.journalEntry.count({
    where: {
      subjectMemberId: memberId,
      entryType: "DISCIPLESHIP",
    },
  });

  return NextResponse.json({
    hasAnnualPlan: !!annualPlan,
    hasMonthlyVision: !!monthlyVision,
    hasLogs: logCount > 0,
  });
}
