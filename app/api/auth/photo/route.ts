import { Avatars } from "node-appwrite";

import { createSessionAppwriteClient, getForwardedUserAgent, getSessionCookieValue } from "@/lib/appwrite/server";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const secret = await getSessionCookieValue();
  if (!secret) return new Response(null, { status: 401, headers });

  try {
    const avatars = new Avatars(createSessionAppwriteClient(secret, await getForwardedUserAgent()));
    const photo = await avatars.getPhoto({ userId: "current()", width: 96, height: 96, output: "png" });
    return new Response(photo, { headers: { ...headers, "Content-Type": "image/png" } });
  } catch {
    return new Response(null, { status: 404, headers });
  }
}
