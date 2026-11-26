import { Account, Client, type Models } from "node-appwrite";
import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";

const appwriteEndpoint = process.env.APPWRITE_ENDPOINT ?? process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const appwriteProjectId = process.env.APPWRITE_PROJECT_ID ?? process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const appwriteApiKey = process.env.APPWRITE_API_KEY;

if (!appwriteEndpoint) {
  throw new Error("APPWRITE_ENDPOINT or NEXT_PUBLIC_APPWRITE_ENDPOINT is required");
}

if (!appwriteProjectId) {
  throw new Error("APPWRITE_PROJECT_ID or NEXT_PUBLIC_APPWRITE_PROJECT_ID is required");
}

const resolvedAppwriteEndpoint = appwriteEndpoint;
const resolvedAppwriteProjectId = appwriteProjectId;

export const APPWRITE_PROJECT_ID = resolvedAppwriteProjectId;
export const APPWRITE_SESSION_COOKIE = `a_session_${APPWRITE_PROJECT_ID}`;
export const LEGACY_USER_ID_COOKIE = "userId";
export const GUEST_ID_COOKIE = "guestId";
export const AUTH_INTENT_COOKIE = "authIntent";

export type AuthIntent = "signup" | "login";

type SessionLike = {
  secret?: string | null;
  expire?: string | null;
};

function createBaseClient(forwardedUserAgent?: string) {
  const client = new Client().setEndpoint(resolvedAppwriteEndpoint).setProject(resolvedAppwriteProjectId);

  if (forwardedUserAgent) {
    client.setForwardedUserAgent(forwardedUserAgent);
  }

  return client;
}

export function createAdminAppwriteClient(forwardedUserAgent?: string) {
  if (!appwriteApiKey) {
    throw new Error("APPWRITE_API_KEY is required for server-side auth routes");
  }

  return createBaseClient(forwardedUserAgent).setKey(appwriteApiKey);
}

export function createSessionAppwriteClient(sessionSecret: string, forwardedUserAgent?: string) {
  return createBaseClient(forwardedUserAgent).setSession(sessionSecret);
}

export async function discardAppwriteSession(secret: string) {
  try {
    const account = new Account(createSessionAppwriteClient(secret, await getForwardedUserAgent()));
    await account.deleteSession({ sessionId: "current" });
  } catch {
    // The provider may already have invalidated this session.
  }
}

export async function getVerifiedSessionUser(
  session: Models.Session,
  forwardedUserAgent: string | undefined,
  expectedUserId?: string,
  expectedEmail?: string,
) {
  if (!session.secret) throw new Error("Appwrite session secret is missing");

  const account = new Account(createSessionAppwriteClient(session.secret, forwardedUserAgent));
  try {
    const user = await account.get();
    if (
      !user.$id || user.$id !== session.userId ||
      (expectedUserId !== undefined && user.$id !== expectedUserId) ||
      (expectedEmail !== undefined && user.email.toLowerCase() !== expectedEmail.toLowerCase())
    ) {
      throw new Error("Appwrite session identity does not match the requested account");
    }
    return user;
  } catch (error) {
    await discardAppwriteSession(session.secret);
    throw error;
  }
}

export function createUserReadClient() {
  const key = process.env.APPWRITE_ANALYTICS_READ_KEY;
  if (!key) throw new Error("Appwrite users.read lookup is not configured");
  return createBaseClient().setKey(key);
}

export async function getSessionCookieValue() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(APPWRITE_SESSION_COOKIE)?.value;
  const trimmed = rawValue?.trim();

  return trimmed ? trimmed : null;
}

export async function getForwardedUserAgent() {
  const headerStore = await headers();
  return headerStore.get("user-agent") ?? undefined;
}

export async function getAppwriteAccountFromSessionCookie() {
  const sessionSecret = await getSessionCookieValue();
  if (!sessionSecret) {
    return null;
  }

  const account = new Account(
    createSessionAppwriteClient(sessionSecret, await getForwardedUserAgent()),
  );

  try {
    return await account.get();
  } catch {
    return null;
  }
}

export function applyAppwriteSessionCookie(response: NextResponse, session: SessionLike) {
  if (!session.secret) {
    throw new Error("Appwrite session secret is missing");
  }

  response.cookies.set(APPWRITE_SESSION_COOKIE, session.secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expire ? new Date(session.expire) : undefined,
  });

  response.cookies.delete(LEGACY_USER_ID_COOKIE);
}

export function clearAppwriteSessionCookie(response: NextResponse) {
  response.cookies.delete(APPWRITE_SESSION_COOKIE);
  response.cookies.delete(LEGACY_USER_ID_COOKIE);
}

export function getAppUrl(request?: Request) {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  if (!request) {
    throw new Error("APP_URL is required when no request context is available");
  }

  return new URL(request.url).origin.replace(/\/$/, "");
}

export function isAuthIntent(value: string | null | undefined): value is AuthIntent {
  return value === "signup" || value === "login";
}

export function toSerializableUser(user: Models.User<Models.Preferences>) {
  return {
    $id: user.$id,
    name: user.name,
    email: user.email,
    emailVerification: user.emailVerification,
    registration: user.registration,
    status: user.status,
    labels: user.labels,
    prefs: user.prefs,
  };
}