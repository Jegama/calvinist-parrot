import { Account } from "node-appwrite";
import { NextResponse } from "next/server";

import {
  applyAppwriteSessionCookie,
  AUTH_INTENT_COOKIE,
  createAdminAppwriteClient,
  discardAppwriteSession,
  getVerifiedSessionUser,
  GUEST_ID_COOKIE,
  getAppUrl,
  getForwardedUserAgent,
  isAuthIntent,
} from "@/lib/appwrite/server";
import { sendFirstVerificationEmail } from "@/lib/appwrite/verification";
import { readGoogleNames } from "@/lib/appwrite/google-profile";
import { transferGuestChatsToUser } from "@/lib/chat-transfer";
import { getGuestId } from "@/lib/guest";
import { getUserProfileForAppwriteUser, upsertUserProfileFromAppwriteUser } from "@/lib/user-profile";

function buildFailureRedirect(origin: string, destination: "login" | "register", reason: string) {
  const url = new URL(`/${destination}`, origin);
  url.searchParams.set("oauth", reason);
  return url;
}

export async function GET(request: Request) {
  let origin: string;
  try {
    origin = getAppUrl(request);
  } catch {
    return NextResponse.json({ error: "Google sign-in is unavailable." }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const secret = searchParams.get("secret");
  const cookieStore = await import("next/headers").then((mod) => mod.cookies());
  const authIntentValue = cookieStore.get(AUTH_INTENT_COOKIE)?.value;
  const authIntent = isAuthIntent(authIntentValue) ? authIntentValue : "login";

  if (!userId || !secret) {
    return NextResponse.redirect(buildFailureRedirect(origin, authIntent === "signup" ? "register" : "login", "missing_credentials"));
  }

  let unissuedSession: string | undefined;
  try {
    const guestId = await getGuestId();
    const forwardedUserAgent = await getForwardedUserAgent();
    const adminAccount = new Account(createAdminAppwriteClient(forwardedUserAgent));
    const session = await adminAccount.createSession({ userId, secret });

    const user = await getVerifiedSessionUser(session, forwardedUserAgent, userId);
    unissuedSession = session.secret;
    const profile = await getUserProfileForAppwriteUser(user);
    const transferGuest = authIntent === "signup" && guestId && !profile;
    const names = !profile || profile.firstName === null || profile.lastName === null
      ? await readGoogleNames(session, forwardedUserAgent)
      : undefined;
    await upsertUserProfileFromAppwriteUser(user, undefined, names);

    if (transferGuest) {
      await transferGuestChatsToUser(guestId, user.$id);
    }

    await sendFirstVerificationEmail(user, session.secret);
    const response = NextResponse.redirect(new URL("/auth/complete", origin));
    applyAppwriteSessionCookie(response, session);
    response.cookies.delete(AUTH_INTENT_COOKIE);

    if (transferGuest) {
      response.cookies.delete(GUEST_ID_COOKIE);
    }

    return response;
  } catch {
    if (unissuedSession) await discardAppwriteSession(unissuedSession);
    const response = NextResponse.redirect(
      buildFailureRedirect(origin, authIntent === "signup" ? "register" : "login", "failed"),
    );
    response.cookies.delete(AUTH_INTENT_COOKIE);
    return response;
  }
}
