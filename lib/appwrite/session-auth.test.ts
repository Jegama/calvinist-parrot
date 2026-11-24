import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => new Map([["a_session_test-project", { value: "test-session" }]]),
  headers: async () => new Headers({ "user-agent": "test-browser" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("authenticates the request through Appwrite using its project session cookie", async () => {
  vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
  vi.stubEnv("APPWRITE_PROJECT_ID", "test-project");
  vi.stubEnv("APPWRITE_API_KEY", "test-admin-key");
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ $id: "reader" }));
  vi.stubGlobal("fetch", transport);

  const { requireAuthenticatedUser } = await import("@/lib/auth");
  expect(await requireAuthenticatedUser()).toMatchObject({ userId: "reader", errorResponse: null });

  expect(transport).toHaveBeenCalledTimes(1);
  const request = new Request(...transport.mock.calls[0]);
  expect(request.method).toBe("GET");
  expect(request.url).toBe("http://localhost/v1/account");
  expect(request.headers.get("x-appwrite-session")).toBe("test-session");
  expect(request.headers.get("x-appwrite-project")).toBe("test-project");
  expect(request.headers.get("x-forwarded-user-agent")).toBe("test-browser");
  expect(request.headers.has("x-appwrite-key")).toBe(false);

  transport.mockResolvedValue(Response.json({ message: "Expired session" }, { status: 401 }));
  const denied = await requireAuthenticatedUser();
  expect(denied.userId).toBe("");
  expect(denied.errorResponse?.status).toBe(401);
});
