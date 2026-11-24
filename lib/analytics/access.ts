import { getAuthenticatedUser } from "@/lib/auth";

// Appwrite accepts only alphanumeric user labels for the analytics_admin role.
const analyticsAdminLabel = "analyticsadmin";

export async function analyticsAccess() {
  const account = await getAuthenticatedUser();
  if (!account) return "signed-out";
  return account.labels.includes(analyticsAdminLabel) ? "authorized" : "forbidden";
}
