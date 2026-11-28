import { getMcpResourceUrl } from "@/lib/mcp/auth";
import { consentCallback, consentSession, getChatGrantScopes } from "@/lib/mcp/auth-consent";

export async function POST(request: Request) {
  const resource = getMcpResourceUrl();
  if (!resource || request.headers.get("origin") !== resource.origin) return new Response("Invalid consent origin.", { status: 403 });
  try {
    const session = await consentSession();
    if (!session) return new Response("Sign in and reconnect your client.", { status: 401 });
    const form = await request.formData();
    const grantId = form.get("grant_id");
    const decision = form.get("decision");
    if (typeof grantId !== "string" || !grantId || (decision !== "allow" && decision !== "deny")) return new Response("Invalid decision.", { status: 400 });
    const grant = await session.oauth.getGrant({ grantId });
    const scopes = getChatGrantScopes(grant, session.account.$id, resource.href);
    if (!scopes) return new Response("This request has expired or is unavailable.", { status: 403 });
    const result = decision === "allow" ? await session.oauth.approve({ grantId, scope: scopes.join(" ") }) : await session.oauth.reject({ grantId });
    const url = consentCallback(result.redirectUrl);
    if (url) return Response.redirect(url, 303);
  } catch {
    // Keep expired or already-consumed grants and upstream exceptions out of the browser response.
  }
  return new Response("Reconnect your client to start a new authorization request.", { status: 400 });
}
