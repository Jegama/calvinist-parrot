import { Account, AppwriteException } from "node-appwrite";
import { NextResponse } from "next/server";

import { createPublicAppwriteClient, getForwardedUserAgent, getSessionAccount } from "@/lib/appwrite/server";
import { sendAccountVerification } from "@/lib/appwrite/verification";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST() {
  try {
    const account = await getSessionAccount();
    if (!account) return NextResponse.json({ error: "Sign in to request verification." }, { status: 401 });
    const user = await account.get();
    if (user.emailVerification) {
      const { email, emailVerification, passwordUpdate } = user;
      return NextResponse.json({ message: "Your email is already verified.", account: { email, emailVerification, passwordUpdate } });
    }
    if (!checkRateLimit(`verify-email:${user.$id}`, 3, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many verification requests. Try again in 15 minutes." }, { status: 429 });
    }
    await sendAccountVerification(account);
    return NextResponse.json({ message: "Verification email sent. Check your inbox." });
  } catch (error) {
    if (error instanceof AppwriteException && error.code === 401) {
      return NextResponse.json({ error: "Sign in again to request verification." }, { status: 401 });
    }
    if (error instanceof AppwriteException && error.code === 429) {
      return NextResponse.json({ error: "Too many verification requests. Please try again later." }, { status: 429 });
    }
    return NextResponse.json({ error: "Could not send the verification email. Please try again later." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.userId !== "string" || !body.userId || typeof body.secret !== "string" || !body.secret) {
    return NextResponse.json({ error: "This verification link is incomplete. Request a new one in Profile." }, { status: 400 });
  }

  try {
    const account = new Account(createPublicAppwriteClient(await getForwardedUserAgent()));
    await account.updateEmailVerification({ userId: body.userId, secret: body.secret });
    return NextResponse.json({ message: "Your email has been verified." });
  } catch (error) {
    if (error instanceof AppwriteException && [400, 401, 403, 404].includes(error.code)) {
      return NextResponse.json({ error: "This verification link has expired, was already used, or is invalid. Check your status in Profile and request a new link if needed." }, { status: 400 });
    }
    return NextResponse.json({ error: "Verification is temporarily unavailable. Try again later." }, { status: 503 });
  }
}
