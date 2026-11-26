import { Account, Query, type Models } from "node-appwrite";

import { createSessionAppwriteClient } from "@/lib/appwrite/server";
import { normalizeProfileName } from "@/lib/profile-identity";

export async function readGoogleNames(session: Models.Session, forwardedUserAgent?: string) {
  try {
    let identity: Pick<Models.Identity, "providerUid" | "providerAccessToken"> | undefined =
      session.provider === "google" && session.providerAccessToken ? session : undefined;
    // The token-exchange session may omit provider credentials. Its linked identity
    // belongs to the same verified Appwrite account and carries the Google token.
    if (!identity) {
      const account = new Account(createSessionAppwriteClient(session.secret, forwardedUserAgent));
      const { identities } = await account.listIdentities({ queries: [Query.equal("provider", "google")] });
      const matches = identities.filter(item => item.userId === session.userId && item.provider === "google" &&
        (!session.providerUid || session.provider !== "google" || item.providerUid === session.providerUid));
      if (matches.length !== 1) return undefined;
      identity = matches[0];
    }
    return await fetchNames(identity);
  } catch {
    // Optional profile information must never prevent sign-in.
    return undefined;
  }
}

async function fetchNames(identity: Pick<Models.Identity, "providerUid" | "providerAccessToken">) {
  if (!identity.providerAccessToken || !identity.providerUid) return undefined;
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${identity.providerAccessToken}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) return undefined;
  const claims = await response.json();
  if (claims?.sub !== identity.providerUid) return undefined;
  return {
    firstName: normalizeProfileName(claims.given_name),
    lastName: normalizeProfileName(claims.family_name),
  };
}
