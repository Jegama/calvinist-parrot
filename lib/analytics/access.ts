import { getAuthenticatedUser } from "@/lib/auth";
import { canViewAnalytics } from "./permissions";

export async function analyticsAccess() {
  const account = await getAuthenticatedUser();
  if (!account) return "signed-out";
  return canViewAnalytics(account.labels) ? "authorized" : "forbidden";
}
