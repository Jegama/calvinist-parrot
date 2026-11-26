import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateMcpRequest, requireMcpAccount } from "./auth";
import { GET as metadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

const resource = "https://parrot.example/api/mcp";
const issuer = "https://auth.example/v1/oauth2/fixture";
const active = { active: true, token_use: "access_token", token_type: "Bearer", sub: "user-a", client_id: "client", iss: issuer, aud: ["https://auth.example/v1/fixture", resource], exp: 4_000_000_000, scope: "openid chat.write" };
const request = (authorization?: string) => new Request(resource, { headers: authorization === undefined ? { Cookie: "userId=account" } : { Authorization: authorization } });

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://parrot.example");
  vi.stubEnv("APPWRITE_ENDPOINT", "https://auth.example/v1");
  vi.stubEnv("APPWRITE_PROJECT_ID", "fixture");
  vi.stubEnv("MCP_APPWRITE_INTROSPECTION_KEY", "fixture-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("MCP authorization", () => {
  it("discovers only the configured resource, Appwrite project and private scope", async () => {
    expect(await metadata().json()).toEqual({ resource, authorization_servers: [issuer], scopes_supported: ["chat.write"], bearer_methods_supported: ["header"] });
    const response = requireMcpAccount();
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain('resource_metadata="https://parrot.example/.well-known/oauth-protected-resource/api/mcp"');
  });

  it("never assigns an account from site cookies, even when private access is off", async () => {
    vi.stubEnv("MCP_APPWRITE_INTROSPECTION_KEY", "");
    expect(metadata().status).toBe(404);
    expect(await authenticateMcpRequest(request())).toEqual({ userId: null });
    expect(await authenticateMcpRequest(request("Bearer test"))).toMatchObject({ status: 503 });
    expect(requireMcpAccount().status).toBe(503);
  });

  it("validates fresh user grants and checks revocation on the next call", async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json(active)).mockResolvedValueOnce(Response.json({ active: false }));
    vi.stubGlobal("fetch", transport);
    expect(await authenticateMcpRequest(request("Bearer test"))).toEqual({ userId: "user-a" });
    expect(transport).toHaveBeenCalledWith(`${issuer}/introspect`, expect.objectContaining({
      method: "POST", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", "X-Appwrite-Project": "fixture", "X-Appwrite-Key": "fixture-key" },
      body: JSON.stringify({ token: "test", token_type_hint: "access_token" }),
    }));
    expect(await authenticateMcpRequest(request("Bearer test"))).toMatchObject({ status: 401 });
  });

  it.each([
    [{ token_use: "refresh_token" }, 401], [{ token_use: "id_token" }, 401], [{ exp: 1 }, 401], [{ client_id: "" }, 401],
    [{ sub: null }, 401], [{ iss: "https://other.example" }, 401], [{ aud: ["https://auth.example/v1/fixture"] }, 401],
    [{ aud: [resource + "-other"] }, 401], [{ scope: "chat.write.other" }, 403],
  ])("rejects unusable credentials %j", async (changes, status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...active, ...changes })));
    const result = await authenticateMcpRequest(request("Bearer test"));
    expect(result).toMatchObject({ status });
    if (result instanceof Response) expect(result.headers.get("WWW-Authenticate")).toContain(status === 403 ? "insufficient_scope" : "invalid_token");
  });

  it("keeps upstream failures private and rejects malformed credentials", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("upstream secrets"));
    vi.stubGlobal("fetch", transport);
    expect(await authenticateMcpRequest(request("Basic test"))).toMatchObject({ status: 401 });
    expect(transport).not.toHaveBeenCalled();
    const result = await authenticateMcpRequest(request("Bearer test"));
    expect(result).toMatchObject({ status: 503 });
    if (result instanceof Response) expect(await result.text()).not.toContain("upstream secrets");
  });
});
