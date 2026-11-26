import { NextResponse } from "next/server";

import {
  clearAppwriteSessionCookie,
  discardAppwriteSession,
  getSessionCookieValue,
} from "@/lib/appwrite/server";

export async function POST() {
  const sessionSecret = await getSessionCookieValue();

  if (sessionSecret) await discardAppwriteSession(sessionSecret);

  const response = NextResponse.json({ success: true });
  clearAppwriteSessionCookie(response);
  return response;
}