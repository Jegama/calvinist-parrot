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

  try {
    const account = new Account(createPublicAppwriteClient(await getForwardedUserAgent()));
    await account.createRecovery({ email, url: `${getAppUrl()}/reset-password` });
  } catch (error) {
    // Account-specific failures and provider mail quotas must not disclose inbox membership.
    const privateFailure = error instanceof AppwriteException && (
      error.type === "user_not_found" || error.type === "user_blocked" || error.type === "user_invalid_credentials" || error.code === 429
    );
    if (!privateFailure) {
      return NextResponse.json({ error: "Password recovery is temporarily unavailable. Try again later." }, { status: 503 });
    }
  }
  return NextResponse.json({ success: true });
}
