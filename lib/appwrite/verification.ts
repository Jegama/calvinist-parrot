import type { Account } from "node-appwrite";

import { getAppUrl } from "./server";

export async function sendAccountVerification(account: Account) {
  await account.createEmailVerification({ url: `${getAppUrl()}/verify-email` });
}
