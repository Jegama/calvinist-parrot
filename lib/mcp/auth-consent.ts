import * as z from "zod";
import { Account, Apps, Client, Oauth2, type Models } from "node-appwrite";
import { getSessionCookieValue } from "@/lib/appwrite/server";
import { getMcpOAuthConfig, MCP_CHAT_SCOPE } from "./auth";

export const consentPath = "/auth/mcp/consent";
type SearchParams = Record<string, string | string[] | undefined>;
const supportedScopes = [MCP_CHAT_SCOPE, "openid", "offline_access"];

export function consentCallback(value: string) {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  if (url.username || url.password) return null;
  const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return url.protocol === "https:" || loopback ? url.href : null;
}

function hasChatScopes(scopes: string[]) {
  return scopes.includes(MCP_CHAT_SCOPE) && scopes.every(scope => supportedScopes.includes(scope));
}

const authorizationRequest = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().refine(uri => Boolean(consentCallback(uri))),
  response_type: z.literal("code"),
  code_challenge: z.string().regex(/^[\w-]{43}$/),
  code_challenge_method: z.literal("S256"),
  scope: z.string().refine(scope => hasChatScopes(scope.split(" "))),
  resource: z.string(),
  prompt: z.literal("consent").optional(),
  state: z.string().optional(),
  nonce: z.string().optional(),
  max_age: z.never().optional(),
  authorization_details: z.never().optional(),
});

export function isChatGrant(grant: Models.Oauth2Grant, userId: string, resource: string) {
  return grant.userId === userId && Date.parse(grant.expire) > Date.now() &&
    grant.resources.length === 1 && grant.resources[0] === resource &&
    hasChatScopes(grant.scopes) &&
    (!grant.authorizationDetails || grant.authorizationDetails === "[]") &&
    (!grant.prompt || grant.prompt === "consent") && Boolean(consentCallback(grant.redirectUri));
}

export async function consentSession() {
  const config = getMcpOAuthConfig();
  if (!config) return null;
  const secret = await getSessionCookieValue();
  if (!secret) return null;
  // Only the user's cookie can read or decide their grant. Never use the introspection key here.
  const client = new Client().setEndpoint(config.endpoint).setProject(config.project).setSession(secret);
  const account = await new Account(client).get();
  return { oauth: new Oauth2(client), apps: new Apps(client), account, resource: config.resource };
}

type ConsentView =
  | { state: "disabled" | "signedOut" | "invalid" }
  | { state: "redirect"; url: string }
  | { state: "grant"; id: string; client: string; account: string; callbackHost: string; scopes: string[] };

export async function loadConsent(params: SearchParams): Promise<ConsentView> {
  if (!getMcpOAuthConfig()) return { state: "disabled" };
  try {
    const session = await consentSession();
    if (!session) return { state: "signedOut" };
    const grantId = params.grant_id;
    if (!grantId) {
      // Appwrite returns the original code-flow parameters here when the browser hasn't signed in yet.
      const parsed = authorizationRequest.safeParse(params);
      if (!parsed.success || parsed.data.resource !== session.resource.href) return { state: "invalid" };
      const request = parsed.data;
      const result = await session.oauth.authorize({
        clientId: request.client_id,
        redirectUri: request.redirect_uri,
        responseType: request.response_type,
        codeChallenge: request.code_challenge,
        codeChallengeMethod: request.code_challenge_method,
        scope: request.scope,
        resource: [request.resource],
        prompt: request.prompt,
        state: request.state,
        nonce: request.nonce,
      });
      if (result.redirectUrl) {
        const url = consentCallback(result.redirectUrl);
        return url ? { state: "redirect", url } : { state: "invalid" };
      }
      // Put the single pending grant in the URL so a refresh won't create another grant.
      return result.grantId ? { state: "redirect", url: `${consentPath}?grant_id=${encodeURIComponent(result.grantId)}` } : { state: "invalid" };
    }
    if (typeof grantId !== "string") return { state: "invalid" };
    const grant = await session.oauth.getGrant({ grantId });
    if (!isChatGrant(grant, session.account.$id, session.resource.href)) return { state: "invalid" };
    const client = grant.appId ? await session.apps.get({ appId: grant.appId }).then(app => app.name).catch(() => grant.appId) : "MCP client";
    return { state: "grant", id: grant.$id, client, account: session.account.email, callbackHost: new URL(grant.redirectUri).host, scopes: grant.scopes };
  } catch (error) {
    return { state: error && typeof error === "object" && "code" in error && error.code === 401 ? "signedOut" : "invalid" };
  }
}
