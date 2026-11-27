import { NextResponse } from "next/server";

import { toSerializableUser } from "@/lib/appwrite/server";
import { hasVerificationEmail } from "@/lib/appwrite/verification";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserProfileForAppwriteUser, toPublicProfile } from "@/lib/user-profile";

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    // An earlier guest read can finish after a sign-in has issued a new cookie.
    return NextResponse.json({ authenticated: false, user: null, profile: null, verificationEmailSent: false });
  }

  const [profile, verificationEmailSent] = await Promise.all([
    getUserProfileForAppwriteUser(user, getAuthenticatedUser), hasVerificationEmail(user),
  ]);

  return NextResponse.json({
    authenticated: true,
    user: toSerializableUser(user),
    profile: toPublicProfile(profile),
    verificationEmailSent,
  });
}
