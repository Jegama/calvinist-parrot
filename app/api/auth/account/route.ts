import { AppwriteException } from "node-appwrite";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionAccount } from "@/lib/appwrite/server";
import { sendAccountVerification } from "@/lib/appwrite/verification";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncConfirmedEmail } from "@/lib/user-profile";

const currentPassword = z.string().min(1).max(256);
const changeSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("email"), email: z.email().max(320), currentPassword }),
  z.object({ field: z.literal("password"), password: z.string().min(8).max(256), currentPassword: currentPassword.optional() }),
]);

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function PATCH(request: Request) {
  const account = await getSessionAccount();
  if (!account) return fail("Sign in to update your account.", 401);
  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Check the email or password fields and try again.", 400);

  try {
    const user = await account.get();
    if (!checkRateLimit(`account-credentials:${user.$id}`, 10, 15 * 60_000)) {
      return fail("Too many attempts. Please try again later.", 429);
    }
    const change = parsed.data;
    let updated;
    let message: string;
    if (change.field === "email") {
      if (!user.passwordUpdate) return fail("Set a password before changing your email.", 400);
      if (change.email.toLowerCase() === user.email.toLowerCase()) return fail("Enter a different email address.", 400);
      updated = await account.updateEmail({ email: change.email, password: change.currentPassword });
      const [mirror, verification] = await Promise.allSettled([
        syncConfirmedEmail(updated, () => account.get()),
        sendAccountVerification(account),
      ]);
      message = verification.status === "fulfilled"
        ? "Email changed. Check your new inbox for the verification link."
        : "Email changed. Use Resend verification to request a new link.";
      if (mirror.status === "rejected") {
        message += " Your saved profile will sync on your next visit.";
      }
    } else {
      if (user.passwordUpdate && !change.currentPassword) return fail("Enter your current password.", 400);
      updated = await account.updatePassword({ password: change.password, oldPassword: change.currentPassword });
      message = user.passwordUpdate ? "Password changed." : "Password set. You can now sign in with your password.";
    }
    return NextResponse.json({
      account: { email: updated.email, emailVerification: updated.emailVerification, passwordUpdate: updated.passwordUpdate },
      message,
    });
  } catch (error) {
    if (error instanceof AppwriteException) {
      if (error.type === "user_invalid_credentials") return fail("Check your current password and try again.", 400);
      if (error.code === 401 || error.code === 403) return fail("Sign in again to update your account.", 401);
      if (error.code === 409) return fail("That email address is unavailable.", 409);
      if (error.code === 429) return fail("Too many attempts. Please try again later.", 429);
      if (error.code === 400) return fail("Appwrite could not accept those details. Check the email or password and try again.", 400);
    }
    return fail("Account settings are temporarily unavailable. Please try again.", 503);
  }
}
