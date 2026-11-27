import { Account, AppwriteException } from "node-appwrite";
import { NextResponse } from "next/server";

import { createPublicAppwriteClient, getAppUrl, getForwardedUserAgent } from "@/lib/appwrite/server";
import { AUTH_IDENTIFIER_MAX_LENGTH } from "@/lib/profile-identity";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const MAX_RECOVERY_REQUESTS_PER_EMAIL = 3;
const MAX_RECOVERY_REQUESTS_PER_IP = 10;
const RECOVERY_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || email.length > AUTH_IDENTIFIER_MAX_LENGTH) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const clientIp = getClientIp(request);
  if (!checkRateLimit(`recovery-ip:${clientIp}`, MAX_RECOVERY_REQUESTS_PER_IP, RECOVERY_WINDOW_MS) ||
      !checkRateLimit(`recovery:${email.toLowerCase()}`, MAX_RECOVERY_REQUESTS_PER_EMAIL, RECOVERY_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many recovery requests. Please try again later." }, { status: 429 });
  }

  let account: Account;
  let url: string;
  try {
    url = `${getAppUrl()}/reset-password`;
    account = new Account(createPublicAppwriteClient(await getForwardedUserAgent()));
  } catch {
    return NextResponse.json({ error: "Password recovery is temporarily unavailable. Try again later." }, { status: 503 });
  }

  try {
    await account.createRecovery({ email, url });
  } catch (error) {
    // Only existing accounts enqueue mail. Returning a queue error would reveal
    // which addresses are registered when the provider has a delivery outage.
    if (!(error instanceof AppwriteException) || error.code >= 500) {
      console.warn("Appwrite could not complete a password recovery request.");
    }
  }
  return NextResponse.json({ success: true });
}
