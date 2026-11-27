import { Prisma, type userProfile } from "@prisma/client";

import prisma from "@/lib/prisma";

type ProfileUser = { $id: string; name: string; email: string; $updatedAt?: string };
type GoogleNames = Pick<userProfile, "firstName" | "lastName">;
type ReadCurrentAccount = () => Promise<ProfileUser | null>;

// Browser responses expose the account fields and statistics used by Profile.
// The database row also contains private pastoral notes and synchronization state.
export function toPublicProfile(profile: userProfile | null) {
  if (!profile) return null;
  return {
    id: profile.id, appwriteUserId: profile.appwriteUserId, email: profile.email,
    displayName: profile.displayName, username: profile.username,
    firstName: profile.firstName, lastName: profile.lastName, firstNameNudgeShown: profile.firstNameNudgeShown,
    denomination: profile.denomination, preferredDepth: profile.preferredDepth, defaultSpaceId: profile.defaultSpaceId,
    answeredPersonalCount: profile.answeredPersonalCount, answeredFamilyCount: profile.answeredFamilyCount,
    journalEntriesCount: profile.journalEntriesCount, lastPrayerAt: profile.lastPrayerAt,
    createdAt: profile.createdAt, updatedAt: profile.updatedAt, lastSeenAt: profile.lastSeenAt,
  };
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Background profile creation knows only the account ID. Once an account has
// supplied an email or either name, even the literal display name "User" is retained.
function syncedDisplayName(user: ProfileUser, profile: userProfile) {
  if (profile.displayName === "User" && profile.email === null &&
      profile.firstName === null && profile.lastName === null) {
    return user.name || user.email || profile.displayName;
  }
  return profile.displayName;
}

type SignupIdentity = Pick<userProfile, "username" | "firstName" | "lastName" | "displayName">;

async function syncProfile(
  tx: Prisma.TransactionClient,
  user: ProfileUser,
  { signup, googleNames, readCurrentAccount }: {
    signup?: SignupIdentity;
    googleNames?: GoogleNames;
    readCurrentAccount?: ReadCurrentAccount;
  } = {},
) {
  const where = { appwriteUserId: user.$id };
  let appwriteUpdatedAt = user.$updatedAt ? new Date(user.$updatedAt) : null;
  let email = user.email || null;
  // The upsert locks this row. Appwrite responses from concurrent requests can arrive out of order.
  const profile = await tx.userProfile.upsert({
    where,
    update: { lastSeenAt: new Date() },
    create: { ...where, email, appwriteUpdatedAt, displayName: user.name || user.email || "Family Member", ...signup },
  });
  const storedVersion = profile.appwriteUpdatedAt?.getTime();
  if (storedVersion !== undefined && (appwriteUpdatedAt?.getTime() ?? -Infinity) <= storedVersion) {
    // Timestamps can tie at millisecond precision. A completed credential change can
    // resolve a tie by reading the live session under this lock. Older snapshots never win.
    if (readCurrentAccount && appwriteUpdatedAt?.getTime() === storedVersion && email !== profile.email) {
      const current = await readCurrentAccount();
      if (current?.$id !== user.$id) throw new Error("Appwrite account changed during profile sync");
      email = current.email || null;
      appwriteUpdatedAt = current.$updatedAt ? new Date(current.$updatedAt) : profile.appwriteUpdatedAt;
    } else {
      email = profile.email;
      appwriteUpdatedAt = profile.appwriteUpdatedAt;
    }
  }

  const firstName = googleNames ? (profile.firstName ?? googleNames.firstName) : profile.firstName;
  const lastName = googleNames ? (profile.lastName ?? googleNames.lastName) : profile.lastName;
  let displayName = syncedDisplayName(user, profile);
  const importedName = firstName !== profile.firstName || lastName !== profile.lastName;
  const previousName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const derivedLabel = displayName === user.name || displayName === user.email || displayName === previousName;
  if (importedName && derivedLabel && ((firstName && lastName) || displayName === user.email)) {
    displayName = [firstName, lastName].filter(Boolean).join(" ");
  }
  if (!importedName && profile.email === email && profile.displayName === displayName &&
      storedVersion === appwriteUpdatedAt?.getTime()) return profile;
  return tx.userProfile.update({ where, data: { email, appwriteUpdatedAt, displayName, firstName, lastName } });
}

export function upsertUserProfileFromAppwriteUser(user: ProfileUser, signup?: SignupIdentity, googleNames?: GoogleNames) {
  return prisma.$transaction(tx => syncProfile(tx, user, { signup, googleNames }));
}

export function syncConfirmedEmail(user: ProfileUser, readCurrentAccount: ReadCurrentAccount) {
  return prisma.$transaction(tx => syncProfile(tx, user, { readCurrentAccount }));
}

type ProfileEdits = Partial<Record<"username" | "firstName" | "lastName" | "denomination", string>>;

export function editUserProfile(user: ProfileUser, edits: ProfileEdits) {
  return prisma.$transaction(async (tx) => {
    // The upsert locks this user's row until commit. Concurrent edits to different
    // parts of the name must both be reflected in the resulting display name.
    const profile = await syncProfile(tx, user);
    const editingName = edits.firstName !== undefined || edits.lastName !== undefined;
    const displayName = editingName
      ? [edits.firstName ?? profile.firstName, edits.lastName ?? profile.lastName].filter(Boolean).join(" ")
      : undefined;
    return tx.userProfile.update({
      where: { appwriteUserId: user.$id },
      data: { ...edits, displayName },
    });
  });
}

export async function getUserProfileForAppwriteUser(user: ProfileUser, readCurrentAccount?: ReadCurrentAccount) {
  const profile = await prisma.userProfile.findUnique({ where: { appwriteUserId: user.$id } });
  // Retry the mirror on a subsequent signed-in read if the original email change
  // reached Appwrite while PostgreSQL was temporarily unavailable.
  if (profile && user.$updatedAt) {
    const version = new Date(user.$updatedAt).getTime();
    const storedVersion = profile.appwriteUpdatedAt?.getTime() ?? -Infinity;
    if (version > storedVersion || (version === storedVersion && readCurrentAccount && profile.email !== (user.email || null))) {
      return prisma.$transaction(tx => syncProfile(tx, user, { readCurrentAccount }));
    }
  }
  return profile && { ...profile, displayName: syncedDisplayName(user, profile) };
}
