import { Prisma, type userProfile } from "@prisma/client";

import prisma from "@/lib/prisma";

type ProfileUser = { $id: string; name: string; email: string };

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

async function syncProfile(tx: Prisma.TransactionClient, user: ProfileUser, signup?: SignupIdentity) {
  const email = user.email || null;
  const where = { appwriteUserId: user.$id };
  // Lock the row and inspect its original identity before setting the email mirror.
  const profile = await tx.userProfile.upsert({
    where,
    update: { lastSeenAt: new Date() },
    create: { ...where, email, displayName: user.name || user.email || "Family Member", ...signup },
  });
  const displayName = syncedDisplayName(user, profile);
  if (profile.email === email && profile.displayName === displayName) return profile;
  return tx.userProfile.update({ where, data: { email, displayName } });
}

export function upsertUserProfileFromAppwriteUser(user: ProfileUser, signup?: SignupIdentity) {
  return prisma.$transaction(tx => syncProfile(tx, user, signup));
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

export async function getUserProfileForAppwriteUser(user: ProfileUser) {
  const profile = await prisma.userProfile.findUnique({ where: { appwriteUserId: user.$id } });
  return profile && { ...profile, displayName: syncedDisplayName(user, profile) };
}
