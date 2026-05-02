import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  void request;
  const { userId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !userId) {
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [questions, profile, membership] = await Promise.all([
    prisma.questionHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userProfile.findUnique({ where: { appwriteUserId: userId } }),
    prisma.prayerMember.findFirst({
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
                assignmentCapacity: true,
                assignmentCount: true,
                isChild: true,
                birthdate: true,
              },
              orderBy: { joinedAt: "asc" },
            },
          },
        },
      },
    }),
  ]);

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
    space: membership?.space ?? null,
    membership: serializedMembership,
  });
}
