import { createHash } from "node:crypto";
import { Account, type Models } from "node-appwrite";

import { createSessionAppwriteClient, getAppUrl, getForwardedUserAgent } from "./server";

type EmailIdentity = Pick<Models.User<Models.Preferences>, "$id" | "email" | "emailVerification" | "targets">;
type VerificationUser = EmailIdentity & Pick<Models.User<Models.Preferences>, "name" | "$updatedAt">;

function emailTarget(user: EmailIdentity) {
  const email = user.email.toLowerCase();
  return user.targets?.find(target =>
    target.providerType === "email" && target.identifier.toLowerCase() === email && target.$id && target.$updatedAt
  );
}

function deliveryKey(email: string, target?: Models.Target) {
  return createHash("sha256").update(JSON.stringify([email.toLowerCase(), target?.$id, target?.$updatedAt])).digest("hex");
}

function verificationKey(user: EmailIdentity) {
  return deliveryKey(user.email, emailTarget(user));
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

async function ensureReceiptProfile(user: VerificationUser) {
  const { default: prisma } = await import("@/lib/prisma");
  const profile = await prisma.userProfile.findUnique({ where: { appwriteUserId: user.$id }, select: { id: true } });
  if (!profile) {
    const { upsertUserProfileFromAppwriteUser } = await import("@/lib/user-profile");
    await upsertUserProfileFromAppwriteUser(user);
  }
}

export async function changeVerificationEmail(account: Account, user: VerificationUser, email: string, password: string) {
  if (emailTarget(user)) return account.updateEmail({ email, password });

  // Legacy Appwrite users have no email-specific timestamp. Clear any receipt for
  // the destination durably before the provider can invalidate links on the change.
  const { default: prisma } = await import("@/lib/prisma");
  await ensureReceiptProfile(user);
  const where = { appwriteUserId: user.$id };
  const destination = deliveryKey(email);
  await prisma.accountVerificationEmail.deleteMany({ where: { ...where, deliveryKey: destination } });

  let changed: Models.User<Models.Preferences> | undefined;
  try {
    return await prisma.$transaction(async tx => {
      // Lock the same row as send(). If an overlapping change has already delivered
      // to the destination since the deletion, let the caller retry with fresh state.
      const receipt = await tx.accountVerificationEmail.upsert({
        where, create: { ...where, deliveryKey: "" }, update: where,
      });
      if (receipt.deliveryKey === destination) throw new Error("Concurrent email change");
      changed = await account.updateEmail({ email, password });
      return changed;
    }, { timeout: 15_000 });
  } catch (error) {
    // Appwrite may have confirmed the change before the database connection was lost.
    if (changed) return changed;
    throw error;
  }
}

async function send(account: Account, user: VerificationUser, automatic: boolean) {
  // The updateEmail response can still include the old target. Read the authoritative
  // revision for explicit sends; sign-in already supplied a fresh account snapshot.
  const recipient = automatic ? user : await account.get();
  if (recipient.$id !== user.$id || recipient.email.toLowerCase() !== user.email.toLowerCase() || recipient.emailVerification) {
    throw new Error("The account email changed during verification.");
  }
  const key = verificationKey(recipient);
  let contactedProvider = false;
  let accepted = false;
  try {
    const { default: prisma } = await import("@/lib/prisma");
    if (!automatic) await ensureReceiptProfile(user);
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
