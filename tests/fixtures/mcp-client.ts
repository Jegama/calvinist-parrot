import { Client, type ClientOptions, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { POST } from "@/app/api/mcp/route";

export const mcpTestUrl = "https://parrot.example/api/mcp";

// Exercise the real route and SDK framing without starting a web server.
export async function connectMcpClient(token?: string, options?: ClientOptions) {
  const client = new Client({ name: "parrot-test", version: "1.0.0" }, options);
  const transport = new StreamableHTTPClientTransport(new URL(mcpTestUrl), {
    requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    fetch: (url, init) => POST(new Request(url, init)),
  });
  await client.connect(transport);
  return client;
}
