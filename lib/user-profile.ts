import type { Models } from "appwrite";

import prisma from "@/lib/prisma";

type ProfileUser = Pick<Models.User<Models.Preferences>, "$id" | "name" | "email">;

export async function upsertUserProfileFromAppwriteUser(user: ProfileUser) {
  const displayName = (user.name || user.email || "Family Member").toString();

  return prisma.userProfile.upsert({
    where: { appwriteUserId: user.$id },
    update: {
      displayName,
      email: user.email || null,
      lastSeenAt: new Date(),
    },
    create: {
      appwriteUserId: user.$id,
      displayName,
      email: user.email || null,
    },
  });
}

export async function getUserProfileByAppwriteId(appwriteUserId: string) {
  return prisma.userProfile.findUnique({ where: { appwriteUserId } });
}