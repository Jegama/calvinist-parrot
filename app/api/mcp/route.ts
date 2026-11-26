import { isIP } from "node:net";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import {
  findChurchesInputSchema, findChurchesResultSchema, getChurchInputSchema, getChurchResultSchema,
} from "@/lib/api/contracts/church";
import { findChurches, retrievePublicChurch } from "@/lib/api/handlers/church";
import { authenticateMcpRequest, getMcpResourceUrl, MCP_CHAT_SCOPE, requireMcpAccount } from "@/lib/mcp/auth";
import { askParrot, askParrotInput, MCP_CHAT_TIMEOUT_MS, McpChatError } from "@/lib/mcp/chat";
import { consumeMcpCallerLimit, mcpChatAccess, McpLimitError } from "@/lib/mcp/limits";
import { version } from "@/package.json";

export const runtime = "nodejs";
export const maxDuration = 240;

function callerKey(request: Request, userId: string | null) {
  if (userId) return `account:${userId}`;
  // Vercel overwrites this header at ingress. On other hosts share one guest
  // bucket until an equivalent trusted ingress can supply network identity.
  const ip = process.env.VERCEL === "1" && request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  return ip && isIP(ip) ? `network:${ip}` : "network:shared";
}

function toolError(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

async function toolResult(action: () => Promise<Record<string, unknown> | null>) {
  try {
    const result = await action();
    if (result === null) return toolError("Church not found.");
    return { structuredContent: result, content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  } catch (error) {
    if (error instanceof McpChatError || error instanceof McpLimitError) return toolError(error.message);
    return toolError("The Parrot service is temporarily unavailable. Retry with the same operation identifiers.");
  }
}

// ChatGPT's mixed-auth tool flow consumes a challenge in the tool result.
// This presentation hint never supplies an identity or grants access.
function usesAppChallenge(meta: unknown) {
  return typeof meta === "object" && meta !== null && ("openai/locale" in meta || "openai/userAgent" in meta);
}

function createServer(request: Request, userId: string | null) {
  const server = new McpServer({ name: "calvinist-parrot", version });
  const key = callerKey(request, userId);
  const directoryAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool("find_churches", {
    description: "Browse a page of saved, evaluated churches. Filter by city, state, denomination or evaluation status.",
    inputSchema: findChurchesInputSchema, outputSchema: findChurchesResultSchema, annotations: directoryAnnotations,
    _meta: { securitySchemes: [{ type: "noauth" }] },
  }, (args) => toolResult(async () => {
    await consumeMcpCallerLimit(key, "directory");
    return findChurches(args);
  }));
  server.registerTool("get_church", {
    description: "Read a saved church, its latest evaluation and supporting links. Reuse the operation UUID on retry.",
    inputSchema: getChurchInputSchema, outputSchema: getChurchResultSchema, annotations: directoryAnnotations,
    _meta: { securitySchemes: [{ type: "noauth" }] },
  }, (args) => toolResult(async () => {
    await consumeMcpCallerLimit(key, "directory");
    const record = await retrievePublicChurch(args.id, "mcp", args.operationId);
    if (record.status === 404) return null;
    if (!record.ok) throw new Error("Church retrieval failed");
    return getChurchResultSchema.parse(await record.json());
  }));
  server.registerTool("ask_parrot", {
    description: `Ask Parrot and receive its final answer with citations. Questions and answers are persisted. Guests get one isolated turn per conversation. ${mcpChatAccess} Authorized questions appear in account history and return a conversation reference for follow-ups. Use a fresh random request UUID for each new question and reuse it on retry.`,
    inputSchema: askParrotInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { securitySchemes: [{ type: "noauth" }, { type: "oauth2", scopes: [MCP_CHAT_SCOPE] }] },
    scopeChallenge: ({ request: rpc }) => {
      if (userId || usesAppChallenge(rpc.params?._meta)) return;
      const input = askParrotInput.safeParse(rpc.params?.arguments);
      if (input.success && (input.data.saveConversation || input.data.conversationRef)) return { scopes: [MCP_CHAT_SCOPE] };
    },
  }, (args, ctx) => {
    if (!userId && (args.saveConversation || args.conversationRef)) {
      const challenge = requireMcpAccount().headers.get("WWW-Authenticate");
      if (!challenge) return toolError("Private chat authorization is unavailable.");
      return {
        ...toolError("Sign in to continue a saved conversation."),
        _meta: { "mcp/www_authenticate": [challenge + ', error="invalid_token", error_description="Sign in to continue a saved conversation."'] },
      };
    }
    return toolResult(async () => {
      await consumeMcpCallerLimit(key, userId ? "account_chat" : "guest_chat");
      const signal = AbortSignal.any([request.signal, ctx.mcpReq.signal, AbortSignal.timeout(MCP_CHAT_TIMEOUT_MS)]);
      return askParrot(args, { userId, callerKey: key, signal });
    });
  });
  return server;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== getMcpResourceUrl()?.origin) {
    return new Response(null, { status: 403 });
  }
  const identity = await authenticateMcpRequest(request);
  if (identity instanceof Response) return identity;
  const handler = createMcpHandler(() => createServer(request, identity.userId), {
    legacy: "stateless", maxRequestBodySize: 128 * 1024, maxSubscriptions: 0,
  });
  const response = await handler.fetch(request);
  if (!identity.userId && response.status === 403 && response.headers.has("www-authenticate")) return requireMcpAccount();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
