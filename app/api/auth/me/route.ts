import { NextResponse } from "next/server";

import { clearAppwriteSessionCookie, toSerializableUser } from "@/lib/appwrite/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserProfileByAppwriteId } from "@/lib/user-profile";

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    const response = NextResponse.json({ authenticated: false, user: null, profile: null });
    clearAppwriteSessionCookie(response);
    return response;
  }

  const profile = await getUserProfileByAppwriteId(user.$id);

  return NextResponse.json({
    authenticated: true,
    user: toSerializableUser(user),
    profile,
  });
}