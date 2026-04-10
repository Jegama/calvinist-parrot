import { Account } from "appwrite";
import { NextResponse } from "next/server";

import { createAdminAppwriteClient, getAppUrl, getForwardedUserAgent } from "@/lib/appwrite/server";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_RECOVERY_REQUESTS = 3;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (!checkRateLimit(`recovery:${email}`, MAX_RECOVERY_REQUESTS, RECOVERY_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Too many recovery requests. Please try again later." },
        { status: 429 },
      );
    }

    const account = new Account(createAdminAppwriteClient(await getForwardedUserAgent()));
    await account.createRecovery(email, `${getAppUrl(request)}/reset-password`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send recovery email.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}