// lib/householdService.ts
// Shared household membership lookup and access control service.
// Reused by Prayer Tracker, Journal, and Kids Discipleship APIs.
// Note: spaceId = household ID (using existing field naming for consistency).

import prisma from "@/lib/prisma";

export type HouseholdMembership = {
  memberId: string;
  spaceId: string;
  role: "OWNER" | "MEMBER";
  displayName: string;
};

/**
 * Get the household membership for a user by their Appwrite ID.
 * Returns null if user has no household.
 */
export async function getMembershipForUser(
  appwriteUserId: string
): Promise<HouseholdMembership | null> {
  const member = await prisma.prayerMember.findFirst({
    where: { appwriteUserId },
    select: {
      id: true,
      spaceId: true,
      role: true,
      displayName: true,
    },
  });
  if (!member) return null;
  return {
    memberId: member.id,
    spaceId: member.spaceId,
    role: member.role as "OWNER" | "MEMBER",
    displayName: member.displayName,
  };
}

/**
 * Assert user has access to a specific space. Throws if unauthorized.
 */
export async function assertHouseholdAccess(
  appwriteUserId: string,
  spaceId: string
): Promise<HouseholdMembership> {
  const member = await prisma.prayerMember.findFirst({
    where: { appwriteUserId, spaceId },
    select: { id: true, spaceId: true, role: true, displayName: true },
  });
  if (!member) {
    throw new Error("User does not have access to this household");
  }
  return {
    memberId: member.id,
    spaceId: member.spaceId,
    role: member.role as "OWNER" | "MEMBER",
    displayName: member.displayName,
  };
}

/**
 * Assert user is the owner of their household. Throws if not owner.
 */
export async function assertOwnerAccess(
  appwriteUserId: string
): Promise<HouseholdMembership> {
  const membership = await getMembershipForUser(appwriteUserId);
  if (!membership) {
    throw new Error("No household found for user");
  }
  if (membership.role !== "OWNER") {
    throw new Error("Only the owner can perform this action");
  }
  return membership;
}

/**
 * Get full household data including space details and all members.
 * Useful for household overview pages.
 * Note: birthdate field will be available after migration is run.
 */
export async function getHouseholdForUser(appwriteUserId: string) {
  const result = await prisma.prayerMember.findFirst({
    where: { appwriteUserId },
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
  });

  if (!result) return null;

  const membership: HouseholdMembership = {
    memberId: result.id,
    spaceId: result.spaceId,
    role: result.role as "OWNER" | "MEMBER",
    displayName: result.displayName,
  };

  return { space: result.space, membership };
}
