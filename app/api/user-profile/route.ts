import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const profile = await prisma.userProfile.findUnique({ where: { appwriteUserId: userId } });
  return NextResponse.json(profile);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { userId, name, email } = body as {
    userId?: string;
    name?: string;
    email?: string;
  };

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const displayName = (name || email || "Family Member").toString();

  const profile = await prisma.userProfile.upsert({
    where: { appwriteUserId: userId },
    update: {
      displayName,
      email: email || null,
      lastSeenAt: new Date(),
    },
    create: {
      appwriteUserId: userId,
      displayName,
      email: email || null,
    },
  });

  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { userId: userIdFromBody, denomination } = body as {
      userId?: string;
      denomination?: string;
    };

    const cookieStore = await cookies();
    const authenticatedUserId = cookieStore.get("userId")?.value;

    if (!authenticatedUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!denomination) {
      return NextResponse.json({ error: "Missing denomination" }, { status: 400 });
    }

    if (userIdFromBody && userIdFromBody !== authenticatedUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
