// lib/householdService.ts
// Shared household membership lookup and access control service.
// Reused by Prayer Tracker, Journal, and Kids Discipleship APIs.
// Note: spaceId = household ID (using existing field naming for consistency).

import prisma from "@/lib/prisma";

// Queue this with the writes that change what other household members can see.
export function bumpSpaceVersion(db: Pick<typeof prisma, "prayerFamilySpace">, spaceId: string) {
  return db.prayerFamilySpace.update({
    where: { id: spaceId },
    data: { version: { increment: 1 } },
    select: { id: true },
  });
}

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

// prayerMember can outlive (or predate) a profile. Look up first names only
// within the caller's authorized household, leaving stored labels as fallbacks.
export async function getHouseholdFirstNames(spaceId: string) {
  const rows = await prisma.$queryRaw<{ id: string; firstName: string }[]>`
    SELECT member.id, profile."firstName"
    FROM "prayerMember" AS member
    JOIN "userProfile" AS profile ON profile."appwriteUserId" = member."appwriteUserId"
    WHERE member."spaceId" = ${spaceId} AND NULLIF(TRIM(profile."firstName"), '') IS NOT NULL
    ORDER BY member.id
  `;
  return new Map(rows.map(({ id, firstName }) => [id, firstName]));
}

type NamedMember = { id: string; displayName: string };

export function withHouseholdName<T extends NamedMember>(member: T, names: Map<string, string>): T {
  return { ...member, displayName: names.get(member.id) ?? member.displayName };
}

export function withPrayerAttribution<T extends { lastPrayedBy: NamedMember | null }>(family: T, names: Map<string, string>) {
  return { ...family, lastPrayedBy: family.lastPrayedBy && withHouseholdName(family.lastPrayedBy, names) };
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

  const names = await getHouseholdFirstNames(result.spaceId);
  const { space, ...member } = result;
  return {
    membership: withHouseholdName(member, names),
    space: { ...space, members: space.members.map(member => withHouseholdName(member, names)) },
  };
}
