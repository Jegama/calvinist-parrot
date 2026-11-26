import { Client } from "node-appwrite";
import { afterEach, expect, it, vi } from "vitest";

const firstVerification = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/lib/appwrite/verification", () => ({ sendFirstVerificationEmail: firstVerification }));

const saved = vi.hoisted(() => ({ get: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/user-profile", () => ({
  getUserProfileForAppwriteUser: saved.get, upsertUserProfileFromAppwriteUser: saved.upsert,
}));
vi.mock("@/lib/chat-transfer", () => ({ transferGuestChatsToUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => new Map(), headers: async () => new Headers() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("finishes a fresh Google sign-in with name claims and skips claims after both names have been saved", async () => {
  vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
  vi.stubEnv("APPWRITE_PROJECT_ID", "test-google");
  vi.stubEnv("APPWRITE_API_KEY", "test-key");
  vi.stubEnv("APP_URL", "https://preview.example.test");
  vi.stubEnv("VERCEL_ENV", "development");

  const user = { $id: "google-account", name: "Provider Name", email: "reader@example.test", emailVerification: false };
  vi.spyOn(Client.prototype, "call").mockImplementation(async function (this: Client, _method, url) {
    if (url.pathname === "/v1/account/sessions/token") return {
      secret: "test-session", userId: user.$id,
      provider: "google", providerUid: "google-id", providerAccessToken: "google-token",
    };
    if (url.pathname === "/v1/account" && this.config.session === "test-session") return user;
    throw new Error("Unexpected provider request");
  });
  const claims = vi.fn().mockResolvedValue(Response.json({
    sub: "google-id", given_name: "Renée", family_name: "Durand",
  }));
  vi.stubGlobal("fetch", claims);
  saved.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ firstName: "Edited", lastName: "Name" });

  const { GET } = await import("./route");
  const request = new Request("https://preview.example.test/api/auth/oauth/google/callback?userId=google-account&secret=exchange-test");
  const first = await GET(request);
  expect(first.headers.get("location")).toBe("https://preview.example.test/auth/complete");
  expect(first.cookies.get("a_session_test-google")?.value).toBe("test-session");
  expect([...first.headers.values()].join(" ")).not.toContain("google-token");
  expect(firstVerification).toHaveBeenCalledWith(expect.objectContaining(user), "test-session");
  expect(saved.upsert).toHaveBeenCalledWith(expect.objectContaining(user), undefined, { firstName: "Renée", lastName: "Durand" });

  expect((await GET(request)).headers.get("location")).toBe("https://preview.example.test/auth/complete");
  expect(claims).toHaveBeenCalledTimes(1);
  expect(saved.upsert).toHaveBeenLastCalledWith(expect.objectContaining(user), undefined, undefined);
});
