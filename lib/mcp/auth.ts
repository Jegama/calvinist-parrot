import { trustedUrl, getDeploymentOrigin } from "@/lib/deployment-origin";
import * as z from "zod";

export const MCP_CHAT_SCOPE = "chat.write";
const metadataPath = "/.well-known/oauth-protected-resource/api/mcp";

const activeAccessToken = z.object({
  active: z.literal(true),
  token_use: z.literal("access_token"),
  token_type: z.string().regex(/^bearer$/i),
  iss: z.string(),
  aud: z.array(z.string()),
  exp: z.number().int(),
  sub: z.string().regex(/^\S+$/),
  client_id: z.string().regex(/^\S+$/),
  // Team installation tokens carry an organization grant and identify the installation.
  authorization_details: z.array(z.unknown()).max(0).nullish(),
  scope: z.string().nullish(),
});

export function getMcpResourceUrl(): URL | null {
  const origin = getDeploymentOrigin();
  return origin ? new URL("/api/mcp", origin) : null;
}

export function getMcpOAuthConfig() {
  const resource = getMcpResourceUrl();
  const project = process.env.APPWRITE_PROJECT_ID ?? process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const key = process.env.MCP_APPWRITE_INTROSPECTION_KEY;
  if (!resource || !project || !key) return null;
  const projectPath = `/oauth2/${encodeURIComponent(project)}`;
  const endpoint = trustedUrl(process.env.APPWRITE_ENDPOINT ?? process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)?.href.replace(/\/$/, "");
  // A site's Appwrite custom domain and the project's advertised OAuth issuer can differ.
  const issuer = trustedUrl(process.env.MCP_APPWRITE_ISSUER || (endpoint && endpoint + projectPath));
  if (!issuer || !issuer.pathname.endsWith(projectPath)) return null;
  return { resource, endpoint: issuer.href.slice(0, -projectPath.length), project, key, issuer: issuer.href };
}

export function protectedResourceMetadata() {
  const config = getMcpOAuthConfig();
  if (!config) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({
    resource: config.resource.href,
    authorization_servers: [config.issuer],
    scopes_supported: [MCP_CHAT_SCOPE],
    bearer_methods_supported: ["header"],
  }, { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
}

function authorizationUnavailable() {
  return Response.json({ error: "Private chat authorization is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

function challenge(resource: URL, error?: "invalid_token" | "insufficient_scope") {
  const parameters = [`resource_metadata="${new URL(metadataPath, resource).href}"`, `scope="${MCP_CHAT_SCOPE}"`];
  if (error) {
    const description = error === "insufficient_scope" ? "Approve the chat.write permission." : "Sign in again to refresh your Parrot connection.";
    parameters.push(`error="${error}"`, `error_description="${description}"`);
  }
  return Response.json({ error: error ?? "authorization_required" }, {
    status: error === "insufficient_scope" ? 403 : 401,
    headers: { "WWW-Authenticate": `Bearer ${parameters.join(", ")}`, "Cache-Control": "no-store" },
  });
}

export function requireMcpAccount(): Response {
  const config = getMcpOAuthConfig();
  return config ? challenge(config.resource) : authorizationUnavailable();
}

export async function authenticateMcpRequest(request: Request): Promise<{ userId: string | null } | Response> {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return { userId: null };
  const config = getMcpOAuthConfig();
  if (!config) return authorizationUnavailable();
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(authorization);
  if (!match) return challenge(config.resource, "invalid_token");

  // Appwrite checks the current token family, including revocation and refresh rotation.
  let introspected: unknown;
  try {
    const response = await fetch(`${config.issuer}/introspect`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
      headers: { "Content-Type": "application/json", "X-Appwrite-Project": config.project, "X-Appwrite-Key": config.key },
      body: JSON.stringify({ token: match[1], token_type_hint: "access_token" }),
    });
    if (!response.ok) return authorizationUnavailable();
    introspected = await response.json();
  } catch {
    return authorizationUnavailable();
  }
  const claims = activeAccessToken.safeParse(introspected);
  if (!claims.success) return challenge(config.resource, "invalid_token");
  const token = claims.data;
  if (token.iss !== config.issuer || !token.aud.includes(config.resource.href) || token.exp <= Date.now() / 1000) {
    return challenge(config.resource, "invalid_token");
  }
  if (!token.scope?.split(" ").includes(MCP_CHAT_SCOPE)) return challenge(config.resource, "insufficient_scope");
  return { userId: token.sub };
}
