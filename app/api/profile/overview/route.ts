import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getUserProfileForAppwriteUser } from "@/lib/user-profile";
import { getHouseholdForUser } from "@/lib/householdService";

export async function GET(request: Request) {
  void request;
  const { user, userId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !user) {
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [questions, profile, household] = await Promise.all([
    prisma.questionHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    getUserProfileForAppwriteUser(user),
    getHouseholdForUser(userId),
  ]);

  const membership = household?.membership;
  const serializedMembership = membership
    ? {
        id: membership.id,
        displayName: membership.displayName,
        appwriteUserId: membership.appwriteUserId,
        role: membership.role,
        joinedAt: membership.joinedAt,
        assignmentCapacity: membership.assignmentCapacity,
        assignmentCount: membership.assignmentCount,
        isChild: membership.isChild,
        birthdate: membership.birthdate,
        spaceId: membership.spaceId,
      }
    : null;

  return NextResponse.json({
    questions,
    profile,
    space: household?.space ?? null,
    membership: serializedMembership,
  });
}
