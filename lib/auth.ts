import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const rawUserId = cookieStore.get("userId")?.value;
  if (!rawUserId) return null;
  const trimmed = rawUserId.trim();
  return trimmed.length ? trimmed : null;
}

export async function requireAuthenticatedUser(providedUserId?: string) {
  const authenticatedUserId = await getAuthenticatedUserId();
  if (!authenticatedUserId) {
    return { userId: null as string | null, errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (providedUserId && providedUserId !== authenticatedUserId) {
    return { userId: authenticatedUserId, errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { userId: authenticatedUserId, errorResponse: null as NextResponse | null };
}
