import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CORE_DOCTRINE_KEYS } from "@/lib/schemas/church-finder";
import { askParrot } from "@/lib/mcp/chat";
import { consumeMcpCallerLimit } from "@/lib/mcp/limits";
import { getChurchResultSchema } from "@/lib/api/contracts/church";
import { findChurches, retrievePublicChurch } from "@/lib/api/handlers/church";
import { fixtureQuestion as question } from "@/tests/fixtures/chat-channels";
import { connectMcpClient, mcpTestUrl } from "@/tests/fixtures/mcp-client";
import { POST } from "./route";

vi.mock("@/lib/mcp/chat", async (original) => ({
  ...await original<typeof import("@/lib/mcp/chat")>(), askParrot: vi.fn(),
}));
vi.mock("@/lib/mcp/limits", async (original) => ({
  ...await original<typeof import("@/lib/mcp/limits")>(), consumeMcpCallerLimit: vi.fn(),
}));
vi.mock("@/lib/api/handlers/church", () => ({ findChurches: vi.fn(), retrievePublicChurch: vi.fn() }));

const issuer = "https://appwrite.example/v1/oauth2/parrot";
const answer = "Love is patient. [1 Corinthians 13:4](https://example.org/1-corinthians/13/4)";
const summary = {
  id: "calvary", name: "Calvary Church", website: "https://calvary.example", city: "Austin", state: "TX",
  denomination: "Presbyterian", confessionAdopted: true, status: "recommended" as const,
};

// OAuth is real through the resource server boundary. Only Appwrite's introspection response is simulated.
function enableTestOAuth() {
  vi.stubEnv("APPWRITE_PROJECT_ID", "parrot");
  vi.stubEnv("APPWRITE_ENDPOINT", "https://appwrite.example/v1");
  vi.stubEnv("MCP_APPWRITE_INTROSPECTION_KEY", "test-key");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe(`${issuer}/introspect`);
    const { token } = JSON.parse(String(init.body));
    return Response.json({
      active: true, aud: [mcpTestUrl], iss: issuer, token_type: "Bearer", token_use: "access_token", scope: "chat.write",
      client_id: "test-client", exp: Math.floor(Date.now() / 1000) + (token === "expired" ? -5 : 60), sub: token,
    });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", new URL(mcpTestUrl).origin);
  vi.stubEnv("MCP_SECRET", "0123456789abcdef0123456789abcdef");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Streamable HTTP client", () => {
  it.each(["2025-11-25", "2026-07-28"])("discovers tools and their persistence annotations over %s", async (version) => {
    const client = await connectMcpClient(undefined, { versionNegotiation: { mode: version === "2025-11-25" ? "legacy" : { pin: "2026-07-28" } } });
    try {
      const { tools } = await client.listTools();
      expect(tools.map(tool => tool.name).sort()).toEqual(["ask_parrot", "find_churches", "get_church"]);
      for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(tool.name !== "ask_parrot");
      const description = tools.find(tool => tool.name === "ask_parrot")?.description;
      expect(description).toMatch(/persist|stor|sav/i);
      expect(description).toContain("10 chat requests per hour per network");
      expect(description).toContain("20 chat requests per minute per account");
    } finally { await client.close(); }
  });

  it("passes bounded directory filters, then retrieves a saved evaluation with the original operation ID", async () => {
    const operationId = randomUUID();
    const detail = {
      ...summary, evaluationState: "evaluated", bestPages: { beliefs: null, about: null, confession: null, leadership: null },
      evaluation: { createdAt: "2026-01-01T00:00:00Z", coreOnSiteCount: 4, coreTotalCount: 5, coverageRatio: 0.8, coreDoctrines: Object.fromEntries(CORE_DOCTRINE_KEYS.map(key => [key, "unknown"])), badges: [], supportingLinks: ["https://calvary.example/beliefs"] },
    };
    vi.mocked(findChurches).mockResolvedValueOnce({ items: [summary], page: 1, pageSize: 1, hasMore: false });
    vi.mocked(findChurches).mockResolvedValueOnce({ items: [], page: 2, pageSize: 1, hasMore: false });
    vi.mocked(retrievePublicChurch).mockResolvedValueOnce(NextResponse.json(getChurchResultSchema.parse(detail)));
    vi.mocked(retrievePublicChurch).mockResolvedValueOnce(NextResponse.json({ error: "Church not found" }, { status: 404 }));
    const client = await connectMcpClient();
    try {
      const filters = { city: "Austin", denomination: "Presbyterian", status: "recommended", pageSize: 1 };
      const list = await client.callTool({ name: "find_churches", arguments: filters });
      expect(list.structuredContent).toMatchObject({ items: [summary], hasMore: false });
      expect(findChurches).toHaveBeenCalledWith({ ...filters, page: 1 });
      const result = await client.callTool({ name: "get_church", arguments: { id: summary.id, operationId } });
      expect(result.structuredContent).toEqual(detail);
      expect(retrievePublicChurch).toHaveBeenCalledWith(summary.id, "mcp", operationId);
      expect(consumeMcpCallerLimit).toHaveBeenCalledWith(expect.any(String), "directory");
      const empty = await client.callTool({ name: "find_churches", arguments: { ...filters, page: 2 } });
      expect(empty.structuredContent).toMatchObject({ items: [], hasMore: false });
      const missing = await client.callTool({ name: "get_church", arguments: { id: "removed", operationId: randomUUID() } });
      expect(missing.isError).toBe(true);
    } finally { await client.close(); }
  });

  it("returns the guest answer and citations verbatim and asks for OAuth on a saved conversation", async () => {
    enableTestOAuth();
    const requestId = randomUUID();
    const sources = ["Calvin, [Commentary on First Corinthians](https://example.org/commentary)"];
    vi.mocked(askParrot).mockResolvedValue({ answer, sources, requestId });
    const client = await connectMcpClient();
    try {
      const result = await client.callTool({ name: "ask_parrot", arguments: { question, requestId } });
      expect(result.structuredContent).toEqual({ answer, sources, requestId });
      expect(askParrot).toHaveBeenCalledWith(expect.objectContaining({ question, requestId }), expect.objectContaining({ userId: null }));
      expect(consumeMcpCallerLimit).toHaveBeenCalledWith(expect.any(String), "guest_chat");
      const privateCall = { name: "ask_parrot", arguments: { question, requestId: randomUUID(), saveConversation: true } };
      const challenge = await POST(new Request(mcpTestUrl, {
        method: "POST", headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: privateCall }),
      }));
      expect(challenge.status).toBe(401);
      expect(challenge.headers.get("WWW-Authenticate")).toContain('scope="chat.write"');
      expect(challenge.headers.get("WWW-Authenticate")).toContain(`${new URL(mcpTestUrl).origin}/.well-known/oauth-protected-resource/api/mcp`);
      expect(askParrot).toHaveBeenCalledTimes(1);
    } finally { await client.close(); }
  });

  it("resolves the bearer subject afresh for each client's follow-up", async () => {
    enableTestOAuth();
    const firstId = randomUUID();
    const secondId = randomUUID();
    const conversationRef = `mcp1_${"a".repeat(43)}`;
    vi.mocked(askParrot).mockResolvedValueOnce({ answer, requestId: firstId, conversationRef });
    vi.mocked(askParrot).mockResolvedValueOnce({ answer, requestId: secondId, conversationRef });
    vi.mocked(askParrot).mockRejectedValueOnce(new Error("Conversation unavailable"));
    const alice = await connectMcpClient("alice");
    const bob = await connectMcpClient("bob");
    try {
      const first = await alice.callTool({ name: "ask_parrot", arguments: { question, requestId: firstId, saveConversation: true } });
      expect(first.structuredContent).toMatchObject({ conversationRef });
      const followUp = { question: "How could I practice it?", requestId: secondId, conversationRef };
      const second = await alice.callTool({ name: "ask_parrot", arguments: followUp });
      expect(second.structuredContent).toMatchObject({ requestId: secondId, answer });
      const other = await bob.callTool({ name: "ask_parrot", arguments: followUp });
      expect(other.isError).toBe(true);
      expect(JSON.stringify(other)).not.toContain(answer);
      expect(askParrot).toHaveBeenNthCalledWith(2, expect.objectContaining(followUp), expect.objectContaining({ userId: "alice" }));
      expect(askParrot).toHaveBeenNthCalledWith(3, expect.objectContaining(followUp), expect.objectContaining({ userId: "bob" }));
      expect(consumeMcpCallerLimit).toHaveBeenCalledWith(expect.any(String), "account_chat");
    } finally { await alice.close(); await bob.close(); }
  });

  it("returns an account-link challenge for a mixed-auth ChatGPT tool call", async () => {
    enableTestOAuth();
    const client = await connectMcpClient();
    try {
      const result = await client.callTool({
        name: "ask_parrot", arguments: { question, requestId: randomUUID(), saveConversation: true }, _meta: { "openai/locale": "en-US" },
      });
      expect(result.isError).toBe(true);
      expect(result._meta?.["mcp/www_authenticate"]).toEqual([expect.stringContaining('scope="chat.write"')]);
      expect(askParrot).not.toHaveBeenCalled();
    } finally { await client.close(); }
  });

  it("rejects malformed JSON and oversized result requests before reading the directory", async () => {
    const response = await POST(new Request(mcpTestUrl, {
      method: "POST", headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" }, body: "{",
    }));
    expect(response.status).toBe(400);
    const client = await connectMcpClient();
    try {
      const invalid = await client.callTool({ name: "find_churches", arguments: { pageSize: 26 } });
      expect(invalid.isError).toBe(true);
      expect(findChurches).not.toHaveBeenCalled();
    } finally { await client.close(); }
  });

  it("rejects an expired token before starting a guest or private tool", async () => {
    enableTestOAuth();
    const response = await POST(new Request(mcpTestUrl, {
      method: "POST", headers: { Authorization: "Bearer expired", Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask_parrot", arguments: { question, requestId: randomUUID() } } }),
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
    expect(askParrot).not.toHaveBeenCalled();
  });
});
