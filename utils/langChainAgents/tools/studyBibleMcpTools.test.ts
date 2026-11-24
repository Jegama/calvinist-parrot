import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { text } from "node:stream/consumers";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { expect, it, vi } from "vitest";

it("discovers and invokes a Study Bible tool over the configured SSE transport", async () => {
  const tool = {
    name: "lookup_verse",
    description: "Look up a Bible reference",
    inputSchema: { type: "object", properties: { reference: { type: "string" } }, required: ["reference"] },
  };
  let stream: ServerResponse | undefined;
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/sse") {
      stream = response;
      stream.writeHead(200, { "Content-Type": "text/event-stream" });
      stream.write("event: endpoint\ndata: /messages\n\n");
      return;
    }
    if (!stream || request.method !== "POST" || request.url !== "/messages") {
      response.writeHead(404).end();
      return;
    }
    const { method, id, params } = JSON.parse(await text(request));
    response.writeHead(202).end();
    if (id === undefined) return; // Notifications have no response.

    let result;
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" },
        };
        break;
      case "tools/list":
        result = { tools: [tool] };
        break;
      case "tools/call":
        result = { content: [{ type: "text", text: `${params.name}: ${params.arguments.reference}` }] };
        break;
      default:
        stream.write(`event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` },
        })}\n\n`);
        return;
    }
    stream.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`);
  });

  const discovery = vi.spyOn(MultiServerMCPClient.prototype, "getTools");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address() as AddressInfo;
    vi.stubEnv("STUDY_BIBLE_MCP_URL", `http://127.0.0.1:${port}/sse`);
    const { getStudyBibleTools } = await import("./studyBibleMcpTools");
    const tools = await getStudyBibleTools();
    expect(tools.map(({ name }) => name)).toEqual(["lookup_verse"]);
    const result = await tools[0].invoke({ reference: "Romans 8:1" });
    expect(result).toEqual("lookup_verse: Romans 8:1");
  } finally {
    // The application keeps this client alive for subsequent tool calls.
    const client = discovery.mock.contexts[0];
    if (client instanceof MultiServerMCPClient) await client.close();
    discovery.mockRestore();
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
});
