import { Account } from "appwrite";
import { NextResponse } from "next/server";

import {
  applyAppwriteSessionCookie,
  AUTH_INTENT_COOKIE,
  createAdminAppwriteClient,
  createSessionAppwriteClient,
  GUEST_ID_COOKIE,
  getAppUrl,
  getForwardedUserAgent,
  isAuthIntent,
} from "@/lib/appwrite/server";
import { transferGuestChatsToUser } from "@/lib/chat-transfer";
import { getGuestId } from "@/lib/guest";
import { getUserProfileByAppwriteId, upsertUserProfileFromAppwriteUser } from "@/lib/user-profile";

function buildFailureRedirect(request: Request, destination: "login" | "register", reason: string) {
  const url = new URL(`${getAppUrl(request)}/${destination}`);
  url.searchParams.set("oauth", reason);
  return url;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const secret = searchParams.get("secret");
  const cookieStore = await import("next/headers").then((mod) => mod.cookies());
  const authIntentValue = cookieStore.get(AUTH_INTENT_COOKIE)?.value;
  const authIntent = isAuthIntent(authIntentValue) ? authIntentValue : "login";

  if (!userId || !secret) {
    return NextResponse.redirect(buildFailureRedirect(request, authIntent === "signup" ? "register" : "login", "missing_credentials"));
  }

  try {
    const guestId = await getGuestId();
    const forwardedUserAgent = await getForwardedUserAgent();
    const adminAccount = new Account(createAdminAppwriteClient(forwardedUserAgent));
    const existingProfile = await getUserProfileByAppwriteId(userId);
    const session = await adminAccount.createSession(userId, secret);

    if (!session.secret) {
      throw new Error("Appwrite did not return a session secret.");
    }

    const sessionAccount = new Account(createSessionAppwriteClient(session.secret, forwardedUserAgent));
    const user = await sessionAccount.get();
    await upsertUserProfileFromAppwriteUser(user);

    if (authIntent === "signup" && guestId && !existingProfile) {
      await transferGuestChatsToUser(guestId, user.$id);
    }

    const response = NextResponse.redirect(new URL("/auth/complete", request.url));
    applyAppwriteSessionCookie(response, session);
    response.cookies.delete(AUTH_INTENT_COOKIE);

    if (authIntent === "signup" && guestId && !existingProfile) {
      response.cookies.delete(GUEST_ID_COOKIE);
    }

    return response;
  } catch {
    const response = NextResponse.redirect(
      buildFailureRedirect(request, authIntent === "signup" ? "register" : "login", "failed"),
    );
    response.cookies.delete(AUTH_INTENT_COOKIE);
    return response;
  }
}
