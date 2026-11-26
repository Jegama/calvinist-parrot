import { Account } from "node-appwrite";
import { NextResponse } from "next/server";

import { createAdminAppwriteClient, getAppUrl, getForwardedUserAgent } from "@/lib/appwrite/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const MAX_RECOVERY_REQUESTS_PER_EMAIL = 3;
const MAX_RECOVERY_REQUESTS_PER_IP = 10;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // Per-IP limit blocks email rotation from a single source; per-email limit
    // blocks targeting one inbox from rotating sources. Both must pass.
    const clientIp = getClientIp(request);
    const ipAllowed = checkRateLimit(`recovery-ip:${clientIp}`, MAX_RECOVERY_REQUESTS_PER_IP, RECOVERY_WINDOW_MS);
    const emailAllowed = checkRateLimit(`recovery:${email.toLowerCase()}`, MAX_RECOVERY_REQUESTS_PER_EMAIL, RECOVERY_WINDOW_MS);

    if (!ipAllowed || !emailAllowed) {
      return NextResponse.json(
        { error: "Too many recovery requests. Please try again later." },
        { status: 429 },
      );
    }

    const account = new Account(createAdminAppwriteClient(await getForwardedUserAgent()));
    await account.createRecovery({ email, url: `${getAppUrl(request)}/reset-password` });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send recovery email.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}