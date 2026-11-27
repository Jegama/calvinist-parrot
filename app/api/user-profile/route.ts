import { NextResponse } from "next/server";
import { z } from "zod";

import { denominationSchema } from "@/lib/api/contracts/common";
import { getAuthenticatedUser } from "@/lib/auth";
import { normalizeProfileName, normalizeUsername, PROFILE_NAME_MAX_LENGTH, USERNAME_HINT } from "@/lib/profile-identity";
import {
  editUserProfile,
  toPublicProfile,
  getUserProfileForAppwriteUser,
  isUniqueConstraintError,
  upsertUserProfileFromAppwriteUser,
} from "@/lib/user-profile";

const nameField = z.string().transform(normalizeProfileName).pipe(
  z.string({ error: `Names must be 1–${PROFILE_NAME_MAX_LENGTH} characters.` }),
);

const profileEdits = z.object({
  username: z.string().transform(normalizeUsername).pipe(z.string({ error: USERNAME_HINT })).optional(),
  firstName: nameField.optional(),
  lastName: nameField.optional(),
  denomination: denominationSchema.optional(),
}).refine((edits) => Object.keys(edits).length > 0, "Choose a profile field to update.");

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(toPublicProfile(await getUserProfileForAppwriteUser(user, getAuthenticatedUser)));
}

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(toPublicProfile(await upsertUserProfileFromAppwriteUser(user)));
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = profileEdits.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    await editUserProfile(user, parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (parsed.data.username && isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "That username is already in use." }, { status: 409 });
    }
    console.error("Error updating user profile:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
