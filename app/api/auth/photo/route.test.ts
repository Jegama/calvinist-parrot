import { Client } from "node-appwrite";
import { afterEach, expect, it, vi } from "vitest";

const session = new Map<string, { value: string }>();
vi.mock("next/headers", () => ({
  cookies: async () => session,
  headers: async () => new Headers(),
}));

afterEach(() => {
  session.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("serves only the session user's Appwrite photo and allows the UI fallback on older projects", async () => {
  vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
  vi.stubEnv("APPWRITE_PROJECT_ID", "test-photo");
  const { GET } = await import("./route");

  const image = new Uint8Array([137, 80, 78, 71]).buffer;
  const call = vi.spyOn(Client.prototype, "call").mockImplementation(async function (this: Client, method, url, _headers, params) {
    expect([method, url.pathname]).toEqual(["get", "/v1/avatars/photo"]);
    expect(params).toEqual({ userId: "current()", width: 96, height: 96, output: "png" });
    expect(this.config.session).toBe("synthetic-session");
    expect(this.config.key).toBeFalsy();
    return image;
  });

  expect((await GET()).status).toBe(401);
  expect(call).not.toHaveBeenCalled();
  session.set("a_session_test-photo", { value: "synthetic-session" });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/png");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.arrayBuffer()).toEqual(image);
  call.mockRejectedValueOnce(new Error("Photo unavailable"));
  expect((await GET()).status).toBe(404);
});
