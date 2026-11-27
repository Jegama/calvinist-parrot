import { Account, AppwriteException } from "node-appwrite";
import { NextResponse } from "next/server";

import { createPublicAppwriteClient, getForwardedUserAgent } from "@/lib/appwrite/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { userId, secret, password } = body ?? {};
  if (typeof userId !== "string" || !userId || typeof secret !== "string" || !secret) {
    return NextResponse.json({ error: "This reset link is incomplete. Request a new password reset email." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Choose a password of at least 8 characters." }, { status: 400 });
  }

  try {
    const account = new Account(createPublicAppwriteClient(await getForwardedUserAgent()));
    await account.updateRecovery({ userId, secret, password });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AppwriteException && [400, 401, 403, 404].includes(error.code)) {
      const message = error.type.startsWith("user_password") || error.type === "user_invalid_password"
        ? "Choose a different password that meets the account's password requirements."
        : "This reset link has expired, was already used, or is invalid. Request a new password reset email.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (error instanceof AppwriteException && error.code === 429) {
      return NextResponse.json({ error: "Too many reset attempts. Please try again later." }, { status: 429 });
    }
    return NextResponse.json({ error: "Password reset is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
