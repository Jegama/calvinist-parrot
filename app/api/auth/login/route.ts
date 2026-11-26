import { NextResponse } from "next/server";

import { createVerifiedPasswordSession, completePasswordSignIn, getCanonicalEmailForUser } from "@/lib/appwrite/password-auth";
import { discardAppwriteSession } from "@/lib/appwrite/server";
import prisma from "@/lib/prisma";
import { normalizeUsername } from "@/lib/profile-identity";
import { passwordAuthRateLimited } from "@/lib/rate-limit";
import { upsertUserProfileFromAppwriteUser } from "@/lib/user-profile";

function invalidLogin() {
  return NextResponse.json({ error: "Invalid email or username and password." }, { status: 401 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const rawIdentifier = body?.identifier ?? body?.email;
  const identifier = typeof rawIdentifier === "string" ? rawIdentifier.trim() : "";
  if (!identifier || identifier.length > 320 || typeof body?.password !== "string" || !body.password) {
    return invalidLogin();
  }
  if (passwordAuthRateLimited(request, "login", identifier)) {
    return NextResponse.json({ error: "Too many sign-in attempts. Please try again later." }, { status: 429 });
  }

  let verified: Awaited<ReturnType<typeof createVerifiedPasswordSession>> | undefined;
  try {
    let email = identifier;
    let username: string | null = null;
    let expectedUserId: string | undefined;
    if (!identifier.includes("@")) {
      username = normalizeUsername(identifier);
      if (!username) return invalidLogin();
      const profile = await prisma.userProfile.findUnique({
        where: { username },
        select: { appwriteUserId: true },
      });
      if (!profile) return invalidLogin();
      expectedUserId = profile.appwriteUserId;
      email = await getCanonicalEmailForUser(expectedUserId);
    }

    verified = await createVerifiedPasswordSession(email, body.password, expectedUserId);
    const profile = await upsertUserProfileFromAppwriteUser(verified.user);
    // A handle may have changed while Appwrite checked the password.
    if (username && profile.username !== username) {
      await discardAppwriteSession(verified.session.secret);
      return invalidLogin();
    }
    return await completePasswordSignIn(verified, profile);
  } catch {
    if (verified) {
      await discardAppwriteSession(verified.session.secret);
      return NextResponse.json({ error: "Could not complete sign-in. Please try again." }, { status: 503 });
    }
    return invalidLogin();
  }
}
