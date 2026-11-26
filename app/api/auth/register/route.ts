import { Account, AppwriteException, ID } from "node-appwrite";
import { NextResponse } from "next/server";

import { completePasswordSignIn, createVerifiedPasswordSession } from "@/lib/appwrite/password-auth";
import { createAdminAppwriteClient, discardAppwriteSession, getForwardedUserAgent } from "@/lib/appwrite/server";
import prisma from "@/lib/prisma";
import { AUTH_IDENTIFIER_MAX_LENGTH, normalizeProfileName, normalizeUsername, USERNAME_HINT } from "@/lib/profile-identity";
import { passwordAuthRateLimited } from "@/lib/rate-limit";
import { isUniqueConstraintError, upsertUserProfileFromAppwriteUser } from "@/lib/user-profile";

type RegistrationIdentity = { username: string; firstName: string; lastName: string };

const registrationConflict = () => NextResponse.json({
  error: "Could not complete this registration. Choose another username, or sign in by email to manage your profile.",
}, { status: 409 });

const retryRegistration = () => NextResponse.json({
  error: "Registration could not finish. Try again, or sign in with your email and choose a username in your profile.",
}, { status: 503 });

async function claimRegistrationProfile(
  user: { $id: string; email: string; name: string },
  identity: RegistrationIdentity,
  createdAccount: boolean,
) {
  const where = { appwriteUserId: user.$id };
  const fields = { ...identity, displayName: `${identity.firstName} ${identity.lastName}` };
  try {
    const profile = await upsertUserProfileFromAppwriteUser(user, fields);
    if (profile.username === identity.username) return profile;

    // A simultaneous sign-in can sync the new account before signup finishes.
    if (createdAccount && profile.username === null) {
      await prisma.userProfile.updateMany({ where: { ...where, username: null }, data: fields });
    } else {
      return null;
    }
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await prisma.userProfile.findUnique({ where });
  return existing?.username === identity.username ? existing : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (email.length > AUTH_IDENTIFIER_MAX_LENGTH) {
    return NextResponse.json({ error: "Email address is too long." }, { status: 400 });
  }
  if (passwordAuthRateLimited(request, "register", email)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const username = normalizeUsername(body?.username);
  const firstName = normalizeProfileName(body?.firstName);
  const lastName = normalizeProfileName(body?.lastName);
  const password = body?.password;
  if (!username) return NextResponse.json({ error: USERNAME_HINT }, { status: 400 });
  if (!firstName || !lastName || !email || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({
      error: "Enter your first name, last name, email, and a password of at least 8 characters.",
    }, { status: 400 });
  }

  let unissuedSession: string | undefined;
  try {
    const owner = await prisma.userProfile.findUnique({ where: { username }, select: { appwriteUserId: true } });
    let expectedUserId = owner?.appwriteUserId;
    let createdAccount = false;
    if (!owner) {
      const account = new Account(createAdminAppwriteClient(await getForwardedUserAgent()));
      try {
        // Appwrite limits the display name to 128 characters. The profile keeps both full names.
        const name = Array.from(`${firstName} ${lastName}`).slice(0, 128).join("");
        const userId = ID.unique();
        const created = await account.create({ userId, email, password, name });
        if (created.$id !== userId) return retryRegistration();
        expectedUserId = userId;
        createdAccount = true;
      } catch (error) {
        if (!(error instanceof AppwriteException)) throw error;
        if (error.code !== 409) {
          if (error.code === 400) {
            return NextResponse.json({ error: "Check your email address and password and try again." }, { status: 400 });
          }
          throw error;
        }
        // A lost reply can leave a valid Appwrite account. Prove ownership before resuming.
      }
    }

    const verified = await createVerifiedPasswordSession(email, password, expectedUserId).catch(() => null);
    if (!verified) return createdAccount ? retryRegistration() : registrationConflict();
    unissuedSession = verified.session.secret;
    const profile = await claimRegistrationProfile(verified.user, { username, firstName, lastName }, createdAccount);
    if (!profile) return registrationConflict();
    const response = await completePasswordSignIn(verified, profile);
    unissuedSession = undefined;
    return response;
  } catch {
    return retryRegistration();
  } finally {
    if (unissuedSession) await discardAppwriteSession(unissuedSession);
  }
}
