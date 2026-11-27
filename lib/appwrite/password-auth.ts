import { Account, Users } from "node-appwrite";
import type { userProfile } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  applyAppwriteSessionCookie,
  createAdminAppwriteClient,
  createUserReadClient,
  getForwardedUserAgent,
  getVerifiedSessionUser,
  GUEST_ID_COOKIE,
  toSerializableUser,
} from "@/lib/appwrite/server";
import { transferGuestChatsToUser } from "@/lib/chat-transfer";
import { sendFirstVerificationEmail } from "./verification";
import { toPublicProfile } from "@/lib/user-profile";
import { getGuestId } from "@/lib/guest";

export async function getCanonicalEmailForUser(userId: string) {
  const user = await new Users(createUserReadClient()).get({ userId });
  if (user.$id !== userId || !user.email) throw new Error("Appwrite user lookup did not match");
  return user.email;
}

export async function createVerifiedPasswordSession(email: string, password: string, expectedUserId?: string) {
  const userAgent = await getForwardedUserAgent();
  const account = new Account(createAdminAppwriteClient(userAgent));
  const session = await account.createEmailPasswordSession({ email, password });
  const user = await getVerifiedSessionUser(session, userAgent, expectedUserId, email);
  return { session, user };
}

export async function completePasswordSignIn(
  { session, user }: Awaited<ReturnType<typeof createVerifiedPasswordSession>>,
  profile: userProfile,
) {
  const guestId = await getGuestId();
  if (guestId) await transferGuestChatsToUser(guestId, user.$id);

  const verificationEmailSent = await sendFirstVerificationEmail(user, session.secret);
  const response = NextResponse.json({ authenticated: true, user: toSerializableUser(user), profile: toPublicProfile(profile), verificationEmailSent });
  applyAppwriteSessionCookie(response, session);
  if (guestId) response.cookies.delete(GUEST_ID_COOKIE);
  return response;
}
