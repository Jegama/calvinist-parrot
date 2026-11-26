import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => new Map([["a_session_test-project", { value: "test-session" }]]),
  headers: async () => new Headers({ "user-agent": "test-browser" }),
}));

afterEach(() => vi.unstubAllEnvs());

it("authenticates through the Node SDK using only the project session cookie", async () => {
  const requests: Array<{ method?: string; url?: string; headers: IncomingHttpHeaders }> = [];
  let status = 200;
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, headers: req.headers });
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(status === 200 ? { $id: "reader" } : { message: "Expired session" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    vi.stubEnv("APPWRITE_ENDPOINT", `http://127.0.0.1:${port}/v1`);
    vi.stubEnv("APPWRITE_PROJECT_ID", "test-project");
    vi.stubEnv("APPWRITE_API_KEY", "test-admin-key");

    const { requireAuthenticatedUser } = await import("@/lib/auth");
    expect(await requireAuthenticatedUser()).toMatchObject({ userId: "reader", errorResponse: null });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "GET", url: "/v1/account",
      headers: {
        "x-appwrite-session": "test-session",
        "x-appwrite-project": "test-project",
        "x-forwarded-user-agent": "test-browser",
      },
    });
    expect(requests[0].headers["x-appwrite-key"]).toBeUndefined();

    status = 401;
    const denied = await requireAuthenticatedUser();
    expect(denied.userId).toBe("");
    expect(denied.errorResponse?.status).toBe(401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
