import { Account } from "appwrite";
import { NextResponse } from "next/server";

import {
  applyAppwriteSessionCookie,
  createAdminAppwriteClient,
  createSessionAppwriteClient,
  GUEST_ID_COOKIE,
  getForwardedUserAgent,
  toSerializableUser,
} from "@/lib/appwrite/server";
import { transferGuestChatsToUser } from "@/lib/chat-transfer";
import { getGuestId } from "@/lib/guest";
import { upsertUserProfileFromAppwriteUser } from "@/lib/user-profile";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const guestId = await getGuestId();
    const forwardedUserAgent = await getForwardedUserAgent();
    const adminAccount = new Account(createAdminAppwriteClient(forwardedUserAgent));
    const session = await adminAccount.createEmailPasswordSession(email, password);

    if (!session.secret) {
      throw new Error("Appwrite did not return a session secret.");
    }

    const sessionAccount = new Account(createSessionAppwriteClient(session.secret, forwardedUserAgent));
    const user = await sessionAccount.get();
    const profile = await upsertUserProfileFromAppwriteUser(user);

    if (guestId) {
      await transferGuestChatsToUser(guestId, user.$id);
    }

    const response = NextResponse.json({
      authenticated: true,
      user: toSerializableUser(user),
      profile,
    });

    applyAppwriteSessionCookie(response, session);

    if (guestId) {
      response.cookies.delete(GUEST_ID_COOKIE);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}