import { cookies } from "next/headers";

import { GUEST_ID_COOKIE } from "@/lib/appwrite/server";
import { getAuthenticatedUserId } from "@/lib/auth";

const GUEST_ID_MAX_AGE = 60 * 60 * 24 * 365;

export type ChatActor =
  | { kind: "authenticated"; userId: string }
  | { kind: "guest"; guestId: string };

export async function getGuestId() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(GUEST_ID_COOKIE)?.value;
  const trimmed = rawValue?.trim();

  return trimmed ? trimmed : null;
}

export async function ensureGuestId() {
  const cookieStore = await cookies();
  const existing = await getGuestId();

  if (existing) {
    return existing;
  }

  const guestId = crypto.randomUUID();
  cookieStore.set(GUEST_ID_COOKIE, guestId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_ID_MAX_AGE,
  });

  return guestId;
}

export async function clearGuestId() {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_ID_COOKIE);
}

export async function resolveChatActor(): Promise<ChatActor> {
  const authenticatedUserId = await getAuthenticatedUserId();
  if (authenticatedUserId) {
    return { kind: "authenticated", userId: authenticatedUserId };
  }

  return { kind: "guest", guestId: await ensureGuestId() };
}

export function getChatActorId(actor: ChatActor) {
  return actor.kind === "authenticated" ? actor.userId : actor.guestId;
}