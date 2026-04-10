import { Account } from "appwrite";
import { NextResponse } from "next/server";

import { createAdminAppwriteClient, getForwardedUserAgent } from "@/lib/appwrite/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const secret = typeof body.secret === "string" ? body.secret.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!userId || !secret || !password) {
      return NextResponse.json({ error: "userId, secret, and password are required." }, { status: 400 });
    }

    const account = new Account(createAdminAppwriteClient(await getForwardedUserAgent()));
    await account.updateRecovery(userId, secret, password);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset password.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}