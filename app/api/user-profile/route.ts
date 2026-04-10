import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  void request;
  const { userId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !userId) {
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.userProfile.findUnique({ where: { appwriteUserId: userId } });
  return NextResponse.json(profile);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { name, email } = body as {
    name?: string;
    email?: string;
  };

  const authenticatedUser = await getAuthenticatedUser();
  if (!authenticatedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const displayName = (name || email || "Family Member").toString();

  const profile = await prisma.userProfile.upsert({
    where: { appwriteUserId: authenticatedUser.$id },
    update: {
      displayName,
      email: email || null,
      lastSeenAt: new Date(),
    },
    create: {
      appwriteUserId: authenticatedUser.$id,
      displayName,
      email: email || null,
    },
  });

  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { denomination } = body as { denomination?: string };

    const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
    if (errorResponse || !authenticatedUserId)
      return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!denomination) {
      return NextResponse.json({ error: "Missing denomination" }, { status: 400 });
    }

    // Valid denominations
    const validDenominations = [
      "reformed-baptist",
      "presbyterian",
      "wesleyan",
      "lutheran",
      "anglican",
      "pentecostal",
      "non-denom",
    ];

    if (!validDenominations.includes(denomination)) {
      return NextResponse.json({ error: "Invalid denomination" }, { status: 400 });
    }

    // Update or create userProfile
    await prisma.userProfile.upsert({
      where: { appwriteUserId: authenticatedUserId },
      update: { denomination },
      create: {
        appwriteUserId: authenticatedUserId,
        displayName: "User", // Will be updated by auth flow
        denomination,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
