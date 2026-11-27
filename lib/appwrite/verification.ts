import { createHash } from "node:crypto";
import { Account, type Models } from "node-appwrite";

import { createSessionAppwriteClient, getAppUrl, getForwardedUserAgent } from "./server";

type EmailIdentity = Pick<Models.User<Models.Preferences>, "$id" | "email" | "emailVerification" | "$updatedAt" | "targets">;

function verificationKey(user: EmailIdentity) {
  const email = user.email.toLowerCase();
  const target = user.targets?.find(target => target.providerType === "email" && target.identifier.toLowerCase() === email);
  // Appwrite updates the email target on each address change, including a change back.
  // Older accounts can lack a target. Their account timestamp also changes on email edits.
  const revision = target?.$updatedAt || user.$updatedAt;
  if (!revision) return null;
  return createHash("sha256").update(JSON.stringify([email, target?.$id, revision])).digest("hex");
}

export async function hasVerificationEmail(user: EmailIdentity) {
  if (user.emailVerification !== false || !user.email) return false;
  try {
    const { default: prisma } = await import("@/lib/prisma");
    const receipt = await prisma.accountVerificationEmail.findUnique({ where: { appwriteUserId: user.$id } });
    return receipt !== null && receipt.deliveryKey === verificationKey(user);
  } catch {
    // Existing sessions and manual sends remain usable during migration rollout.
    return false;
  }
}

async function deliver(account: Account) {
  await account.createEmailVerification({ url: `${getAppUrl()}/verify-email` });
}

type VerificationUser = EmailIdentity & Pick<Models.User<Models.Preferences>, "name">;

async function send(account: Account, user: VerificationUser, automatic: boolean) {
  // The updateEmail response can still include the old target. Read the authoritative
  // revision for explicit sends; sign-in already supplied a fresh account snapshot.
  const recipient = automatic ? user : await account.get();
  if (recipient.$id !== user.$id || recipient.email.toLowerCase() !== user.email.toLowerCase() || recipient.emailVerification) {
    throw new Error("The account email changed during verification.");
  }
  const key = verificationKey(recipient);
  if (!key) {
    if (automatic) return false;
    await deliver(account);
    return true;
  }
  let contactedProvider = false;
  let accepted = false;
  try {
    const { default: prisma } = await import("@/lib/prisma");
    if (!automatic) {
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
        INSERT INTO "accountVerificationEmail" ("appwriteUserId", "email") VALUES (${user.$id}, ${key})
        ON CONFLICT ("appwriteUserId") DO UPDATE SET "email" = EXCLUDED."email"
        WHERE "accountVerificationEmail"."email" <> EXCLUDED."email"
      `;
      if (automatic && changed === 0) return true;

      contactedProvider = true;
      // A sign-in or resend can arrive behind an email change in another session.
      const current = await account.get();
      if (current.$id !== user.$id || verificationKey(current) !== key || current.emailVerification) {
        throw new Error("The account email changed during verification.");
      }
      await deliver(account);
      accepted = true;
      return true;
    }, { timeout: 15_000 });
  } catch (error) {
    if (accepted || automatic) return accepted;
    if (contactedProvider) throw error;
    // A missing receipt table or unavailable DB must not disable explicit sends.
    await deliver(account);
    return true;
  }
}

export function sendAccountVerification(account: Account, user: VerificationUser) {
  return send(account, user, false);
}

export async function sendFirstVerificationEmail(user: VerificationUser, sessionSecret: string) {
  if (user.emailVerification !== false || !user.email) return false;
  try {
    const account = new Account(createSessionAppwriteClient(sessionSecret, await getForwardedUserAgent()));
    return await send(account, user, true);
  } catch {
    return false;
  }
}
