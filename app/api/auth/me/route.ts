import { NextResponse } from "next/server";

import { clearAppwriteSessionCookie, toSerializableUser } from "@/lib/appwrite/server";
import { hasVerificationEmail } from "@/lib/appwrite/verification";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserProfileForAppwriteUser } from "@/lib/user-profile";

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    const response = NextResponse.json({ authenticated: false, user: null, profile: null, verificationEmailSent: false });
    clearAppwriteSessionCookie(response);
    return response;
  }

  const [profile, verificationEmailSent] = await Promise.all([
    getUserProfileForAppwriteUser(user, getAuthenticatedUser), hasVerificationEmail(user),
  ]);

  return NextResponse.json({
    authenticated: true,
    user: toSerializableUser(user),
    profile,
    verificationEmailSent,
  });
}
