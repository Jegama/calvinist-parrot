import { Account, type Models } from "node-appwrite";

import { createSessionAppwriteClient, getAppUrl, getForwardedUserAgent } from "./server";

type EmailIdentity = Pick<Models.User<Models.Preferences>, "$id" | "email" | "emailVerification">;

export async function hasVerificationEmail(user: EmailIdentity) {
  if (user.emailVerification !== false || !user.email) return false;
  try {
    const { default: prisma } = await import("@/lib/prisma");
    const receipt = await prisma.accountVerificationEmail.findUnique({ where: { appwriteUserId: user.$id } });
    return receipt?.email === user.email.toLowerCase();
  } catch {
    // Existing sessions and manual sends remain usable during migration rollout.
    return false;
  }
}

async function deliver(account: Account) {
  await account.createEmailVerification({ url: `${getAppUrl()}/verify-email` });
}

type VerificationUser = EmailIdentity & Pick<Models.User<Models.Preferences>, "name" | "$updatedAt">;
type SendReason = "sign-in" | "resend" | "email-change";

async function send(account: Account, user: VerificationUser, reason: SendReason) {
  const email = user.email.toLowerCase();
  let contactedProvider = false;
  let accepted = false;
  try {
    const { default: prisma } = await import("@/lib/prisma");
    if (reason !== "sign-in") {
      // Some older Appwrite sessions predate the creation of a local profile.
      const profile = await prisma.userProfile.findUnique({ where: { appwriteUserId: user.$id }, select: { id: true } });
      if (!profile) {
        const { upsertUserProfileFromAppwriteUser } = await import("@/lib/user-profile");
        await upsertUserProfileFromAppwriteUser(user);
      }
    }
    return await prisma.$transaction(async tx => {
      // The unique account row serializes sends across instances. Concurrent sign-ins
      // see the first accepted send when its transaction commits.
      const changed = await tx.$executeRaw`
        INSERT INTO "accountVerificationEmail" ("appwriteUserId", "email") VALUES (${user.$id}, ${email})
        ON CONFLICT ("appwriteUserId") DO UPDATE SET "email" = EXCLUDED."email"
        WHERE "accountVerificationEmail"."email" <> EXCLUDED."email"
      `;
      if (reason === "sign-in" && changed === 0) return true;

      contactedProvider = true;
      // A sign-in or resend can arrive behind an email change in another session.
      const current = await account.get().catch(error => {
        if (reason !== "email-change") throw error;
        return null;
      });
      if (current && (current.$id !== user.$id || current.email.toLowerCase() !== email || current.emailVerification)) {
        throw new Error("The account email changed during verification.");
      }
      if (current) {
        try {
          await deliver(account);
          accepted = true;
          return true;
        } catch (error) {
          if (reason !== "email-change") throw error;
        }
      }

      // Appwrite invalidates earlier links when it changes the address. Even if
      // this delivery failed, committing the invalidation prevents a later change
      // back to that address from reviving a receipt for an unusable link.
      await tx.accountVerificationEmail.delete({ where: { appwriteUserId: user.$id } });
      return false;
    }, { timeout: 15_000 });
  } catch (error) {
    if (accepted || reason === "sign-in") return accepted;
    if (contactedProvider) throw error;
    // A missing receipt table or unavailable DB must not disable explicit sends.
    await deliver(account);
    return true;
  }
}

export function sendAccountVerification(account: Account, user: VerificationUser, reason: "resend" | "email-change" = "resend") {
  return send(account, user, reason);
}

export async function sendFirstVerificationEmail(user: VerificationUser, sessionSecret: string) {
  if (user.emailVerification !== false || !user.email) return false;
  try {
    const account = new Account(createSessionAppwriteClient(sessionSecret, await getForwardedUserAgent()));
    return await send(account, user, "sign-in");
  } catch {
    return false;
  }
}
