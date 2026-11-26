import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

type ProfileUser = { $id: string; name: string; email: string };

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function upsertUserProfileFromAppwriteUser(user: ProfileUser, db: Prisma.TransactionClient = prisma) {
  const email = user.email || null;

  return db.userProfile.upsert({
    where: { appwriteUserId: user.$id },
    update: {
      email,
      lastSeenAt: new Date(),
    },
    create: {
      appwriteUserId: user.$id,
      displayName: user.name || user.email || "Family Member",
      email,
    },
  });
}

type ProfileEdits = Partial<Record<"username" | "firstName" | "lastName" | "denomination", string>>;

export function editUserProfile(user: ProfileUser, edits: ProfileEdits) {
  return prisma.$transaction(async (tx) => {
    // The upsert locks this user's row until commit. Concurrent edits to different
    // parts of the name must both be reflected in the resulting display name.
    const profile = await upsertUserProfileFromAppwriteUser(user, tx);
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

export async function getUserProfileByAppwriteId(appwriteUserId: string) {
  return prisma.userProfile.findUnique({ where: { appwriteUserId } });
}
