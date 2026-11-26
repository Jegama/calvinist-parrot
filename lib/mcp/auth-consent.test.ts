import { Account, Apps, Oauth2, type Models } from "node-appwrite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSessionCookieValue } from "@/lib/appwrite/server";
import { POST as decide } from "@/app/auth/mcp/consent/decision/route";
import { loadConsent } from "./auth-consent";

vi.mock("@/lib/appwrite/server", () => ({ getSessionCookieValue: vi.fn(), getForwardedUserAgent: async () => undefined }));
const origin = "https://parrot.example";
const resource = `${origin}/api/mcp`;
const callback = "https://client.example/callback";
const grant: Models.Oauth2Grant = { $id: "grant", $createdAt: "", $updatedAt: "", userId: "user-a", appId: "client", scopes: ["chat.write"], resources: [resource], authorizationDetails: "[]", prompt: "consent", redirectUri: callback, authTime: 1_700_000_000, expire: "2100-01-01T00:00:00Z" };
const query = { client_id: "client", redirect_uri: callback, response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256", scope: "chat.write", resource, state: "test-state" };

function decision(action: string, source = origin) {
  return new Request(`${origin}/auth/mcp/consent/decision`, { method: "POST", headers: { Origin: source }, body: new URLSearchParams({ grant_id: "grant", decision: action }) });
}

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("MCP_APPWRITE_ISSUER", "");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("APPWRITE_ENDPOINT", "https://auth.example/v1");
  vi.stubEnv("APPWRITE_PROJECT_ID", "fixture");
  vi.stubEnv("MCP_APPWRITE_INTROSPECTION_KEY", "fixture-key");
  vi.mocked(getSessionCookieValue).mockResolvedValue("test-session");
  vi.spyOn(Account.prototype, "get").mockResolvedValue({ $id: "user-a", email: "a@example.test" } as Models.User);
  vi.spyOn(Apps.prototype, "get").mockResolvedValue({ name: "MCP fixture" } as Models.App);
  vi.spyOn(Oauth2.prototype, "getGrant").mockResolvedValue(grant);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("requires an Appwrite account before handling a pending grant", async () => {
  vi.mocked(getSessionCookieValue).mockResolvedValue(null);
  expect(await loadConsent({ grant_id: "grant" })).toEqual({ state: "signedOut" });
  expect((await decide(decision("allow"))).status).toBe(401);
});

it("resumes the client's code flow with its S256 challenge, resource and state", async () => {
  const begin = vi.spyOn(Oauth2.prototype, "authorize").mockResolvedValue({ grantId: "grant", redirectUrl: "" });
  expect(await loadConsent(query)).toEqual({ state: "redirect", url: "/auth/mcp/consent?grant_id=grant" });
  expect(begin).toHaveBeenCalledWith(expect.objectContaining({ state: query.state, codeChallenge: query.code_challenge, codeChallengeMethod: "S256", resource: [resource] }));
  for (const changes of [{ code_challenge_method: "plain" }, { code_challenge: "short" }, { resource: "https://other.example" }, { scope: "project:all" }]) {
    expect(await loadConsent({ ...query, ...changes })).toEqual({ state: "invalid" });
  }
  expect(begin).toHaveBeenCalledTimes(1);
});

it("shows the grant's application and account before the user chooses", async () => {
  expect(await loadConsent({ grant_id: "grant" })).toEqual({ state: "grant", id: "grant", client: "MCP fixture", account: "a@example.test", callbackHost: "client.example", scopes: ["chat.write"] });
});

it("requires same-origin consent and verifies the grant again for each decision", async () => {
  const approve = vi.spyOn(Oauth2.prototype, "approve").mockResolvedValue({ redirectUrl: `${callback}?code=test` });
  const reject = vi.spyOn(Oauth2.prototype, "reject").mockResolvedValue({ redirectUrl: `${callback}?error=access_denied` });
  expect((await decide(decision("allow", "https://other.example"))).status).toBe(403);
  expect(approve).not.toHaveBeenCalled();
  expect((await decide(decision("deny"))).headers.get("location")).toBe(`${callback}?error=access_denied`);
  expect(reject).toHaveBeenCalledWith({ grantId: "grant" });
  expect((await decide(decision("allow"))).headers.get("location")).toBe(`${callback}?code=test`);
  expect(approve).toHaveBeenCalledWith({ grantId: "grant", scope: "chat.write" });
  for (const changes of [{ userId: "user-b" }, { scopes: ["chat.write", "project:all"] }, { resources: [] }, { expire: "2000-01-01T00:00:00Z" }]) {
    vi.mocked(Oauth2.prototype.getGrant).mockResolvedValue({ ...grant, ...changes });
    expect(await loadConsent({ grant_id: "grant" })).toEqual({ state: "invalid" });
    expect((await decide(decision("allow"))).status).toBe(403);
  }
  expect(approve).toHaveBeenCalledTimes(1);
});
