import { NextResponse } from "next/server";

import { getAppwriteAccountFromSessionCookie } from "@/lib/appwrite/server";

type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

type RequireAuthenticatedUserResult = {
  user: AuthenticatedUser | null;
  userId: string;
  errorResponse: NextResponse | null;
};

export async function getAuthenticatedUserId(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.$id ?? null;
}

export async function getAuthenticatedUser() {
  return getAppwriteAccountFromSessionCookie();
}

export async function requireAuthenticatedUser(providedUserId?: string): Promise<RequireAuthenticatedUserResult> {
  const authenticatedUser = await getAuthenticatedUser();
  if (!authenticatedUser) {
    return {
      user: null,
      userId: "",
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (providedUserId && providedUserId !== authenticatedUser.$id) {
    return {
      user: authenticatedUser,
      userId: authenticatedUser.$id,
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    user: authenticatedUser,
    userId: authenticatedUser.$id,
    errorResponse: null,
  };
}
