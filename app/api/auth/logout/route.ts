import { Account } from "appwrite";
import { NextResponse } from "next/server";

import {
  clearAppwriteSessionCookie,
  createSessionAppwriteClient,
  getForwardedUserAgent,
  getSessionCookieValue,
} from "@/lib/appwrite/server";

export async function POST() {
  const sessionSecret = await getSessionCookieValue();

  if (sessionSecret) {
    try {
      const account = new Account(
        createSessionAppwriteClient(sessionSecret, await getForwardedUserAgent()),
      );
      await account.deleteSession("current");
    } catch {
      // Clear the local cookie even if the upstream session is already invalid.
    }
  }

  const response = NextResponse.json({ success: true });
  clearAppwriteSessionCookie(response);
  return response;
}