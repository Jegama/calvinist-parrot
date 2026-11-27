import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appwriteUserId = user.$id;
  // A legacy session can predate the local profile. Preserve any existing or
  // concurrently created profile, including its saved name and claim.
  const created = await prisma.userProfile.createMany({
    data: {
      appwriteUserId,
      displayName: user.name || user.email || "Family Member",
      email: user.email || null,
      appwriteUpdatedAt: user.$updatedAt ? new Date(user.$updatedAt) : null,
      firstNameNudgeShown: true,
    },
    skipDuplicates: true,
  });
  if (created.count) return NextResponse.json({ show: true });

  // The predicate and write run together, so only one device wins the claim.
  const claimed = await prisma.userProfile.updateMany({
    where: { appwriteUserId, firstNameNudgeShown: false, OR: [{ firstName: null }, { firstName: "" }] },
    data: { firstNameNudgeShown: true },
  });
  return NextResponse.json({ show: claimed.count === 1 });
}
