import { Query } from "node-appwrite";
import { z } from "zod";
import { APPWRITE_PROJECT_ID } from "@/lib/appwrite/server";

export type AccountRegistration = { id: string; registeredAt: Date };

const PAGE_SIZE = 100;
const registrationPage = z.object({
  users: z.array(z.object({ $id: z.string().min(1), registration: z.iso.datetime({ offset: true }) })),
});

// The Users API includes account details. Keep only the join key and the
// original registration instant inside this server-side reporting boundary.
export async function getRegistrations(start: Date, end: Date): Promise<AccountRegistration[]> {
  const endpoint = process.env.APPWRITE_ENDPOINT ?? process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const key = process.env.APPWRITE_ANALYTICS_READ_KEY;
  if (!endpoint || !key) throw new Error("Registration source is not configured");

  const queries = [
    Query.greaterThanEqual("registration", start.toISOString()),
    Query.lessThan("registration", end.toISOString()),
    Query.limit(PAGE_SIZE),
    Query.orderAsc("$id"),
  ];
  const registrations = new Map<string, AccountRegistration>();
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  const signal = AbortSignal.timeout(10000);
  do {
    const url = new URL(endpoint.replace(/\/$/, "") + "/users");
    url.searchParams.set("total", "false");
    for (const query of queries) url.searchParams.append("queries[]", query);
    if (cursor) url.searchParams.append("queries[]", Query.cursorAfter(cursor));
    const response = await fetch(url, {
      headers: { "X-Appwrite-Project": APPWRITE_PROJECT_ID, "X-Appwrite-Key": key },
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok) throw new Error("Registration source unavailable");
    const { users } = registrationPage.parse(await response.json());
    for (const user of users) {
      const registeredAt = new Date(user.registration);
      if (registeredAt >= start && registeredAt < end) {
        registrations.set(user.$id, { id: user.$id, registeredAt });
      }
    }
    cursor = users.length >= PAGE_SIZE ? users.at(-1)?.$id : undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error("Registration cursor did not advance");
      seenCursors.add(cursor);
    }
  } while (cursor);
  return [...registrations.values()];
}
