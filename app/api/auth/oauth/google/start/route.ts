import { Account, OAuthProvider } from "appwrite";
import { NextResponse } from "next/server";

import {
  AUTH_INTENT_COOKIE,
  createAdminAppwriteClient,
  getAppUrl,
  getForwardedUserAgent,
  isAuthIntent,
} from "@/lib/appwrite/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const intentParam = searchParams.get("intent");

  if (!isAuthIntent(intentParam)) {
    return NextResponse.json({ error: "Invalid auth intent." }, { status: 400 });
  }

  try {
    const appUrl = getAppUrl(request);
    const account = new Account(createAdminAppwriteClient(await getForwardedUserAgent()));
    const redirectUrl = await account.createOAuth2Token(
      OAuthProvider.Google,
      `${appUrl}/api/auth/oauth/google/callback`,
      `${appUrl}/${intentParam === "signup" ? "register" : "login"}?oauth=failed`,
    );

    if (!redirectUrl) {
      throw new Error("Appwrite did not return an OAuth redirect URL.");
    }

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(AUTH_INTENT_COOKIE, intentParam, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Google sign-in.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}