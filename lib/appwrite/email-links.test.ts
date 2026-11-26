import { AppwriteException, Client } from "node-appwrite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const cookies = vi.hoisted(() => new Map<string, { value: string }>());
// Exercise the supported rollout window before the additive receipt table exists.
vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: vi.fn().mockRejectedValue(new Error("Receipt table is not deployed")),
    userProfile: { findUnique: vi.fn().mockResolvedValue({ id: "profile" }) },
    accountVerificationEmail: { findUnique: vi.fn().mockRejectedValue(new Error("Receipt table is not deployed")) },
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => cookies,
  headers: async () => new Headers({ "user-agent": "test-browser" }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("APPWRITE_ENDPOINT", "https://appwrite.example/v1");
  vi.stubEnv("APPWRITE_PROJECT_ID", "test-project");
  vi.stubEnv("APPWRITE_API_KEY", "unused-admin-key");
  vi.stubEnv("APP_URL", "https://parrot.example");
  vi.stubEnv("VERCEL_ENV", "");
  cookies.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function request(path: string, fields: object, method = "POST") {
  return new Request(`https://untrusted.example${path}`, { method, body: JSON.stringify(fields) });
}

it("keeps unknown and known recovery addresses indistinguishable and applies the same request limit", async () => {
  const { POST } = await import("@/app/api/auth/password/recovery/route");
  const known = "known@example.test", unknown = "unknown@example.test";
  const sdk = vi.spyOn(Client.prototype, "call").mockImplementation(async (_method, _url, _headers, body) => {
    if (body?.email === unknown) throw new AppwriteException("No such user", 404, "user_not_found");
    return {};
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    const responses = await Promise.all([known, unknown].map(email => POST(request("/api/auth/password/recovery", { email }))));
    const status = attempt < 3 ? 200 : 429;
    expect(responses.map(r => r.status)).toEqual([status, status]);
    const [first, second] = await Promise.all(responses.map(r => r.json()));
    expect(second).toEqual(first);
  }
  expect(sdk).toHaveBeenCalledTimes(6);
  expect(sdk.mock.calls[0][3]).toEqual({ email: known, url: "https://parrot.example/reset-password" });
  expect(sdk.mock.contexts[0]).toMatchObject({ config: { key: "", session: "" } });
});

it("sends to the session account, enforces its resend limit, and uses the approved Preview origin", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_BRANCH_URL", "parrot-branch.vercel.app");
  const { POST } = await import("@/app/api/auth/verification/route");
  const sdk = vi.spyOn(Client.prototype, "call");
  expect((await POST()).status).toBe(401);
  expect(sdk).not.toHaveBeenCalled();
  cookies.set("a_session_test-project", { value: "synthetic-session" });
  let verified = false;
  sdk.mockImplementation(async method => method === "get" ? { $id: "reader", emailVerification: verified, email: "reader@example.test" } : {});
  for (let attempt = 0; attempt < 4; attempt++) {
    expect((await POST()).status).toBe(attempt < 3 ? 200 : 429);
  }
  verified = true;
  expect(await (await POST()).json()).toMatchObject({ message: "Your email is already verified.", account: { emailVerification: true } });
  const sent = sdk.mock.calls.filter(([method]) => method === "post");
  expect(sent).toHaveLength(3);
  for (const [, path, , body] of sent) {
    expect(path.pathname).toBe("/v1/account/verifications/email");
    expect(body).toEqual({ url: "https://parrot-branch.vercel.app/verify-email" });
  }
  for (const context of sdk.mock.contexts) expect(context).toMatchObject({ config: { key: "", session: "synthetic-session" } });
});

it("skips the automatic send when its receipt cannot be stored and still allows an explicit request", async () => {
  const { sendFirstVerificationEmail, hasVerificationEmail } = await import("@/lib/appwrite/verification");
  const { POST: resend } = await import("@/app/api/auth/verification/route");
  const user = { $id: "reader", name: "Reader", $updatedAt: "", email: "reader@example.test", emailVerification: false };
  const sdk = vi.spyOn(Client.prototype, "call").mockImplementation(async method => method === "get" ? user : {});
  expect(await sendFirstVerificationEmail(user, "synthetic-session")).toBe(false);
  expect(await hasVerificationEmail(user)).toBe(false);
  expect(sdk).not.toHaveBeenCalled();
  cookies.set("a_session_test-project", { value: "synthetic-session" });
  expect(await (await resend()).json()).toMatchObject({ verificationEmailSent: true });
  expect(sdk.mock.calls.filter(([method]) => method === "post")).toHaveLength(1);
});

it("refuses to mail a recovery link without a trusted origin", async () => {
  vi.stubEnv("APP_URL", "");
  const { POST } = await import("@/app/api/auth/password/recovery/route");
  const sdk = vi.spyOn(Client.prototype, "call");
  expect((await POST(request("/api/auth/password/recovery", { email: "known@example.test" }))).status).toBe(503);
  expect(sdk).not.toHaveBeenCalled();
});

it.each(["verification", "password/reset"])("accepts a valid %s link without a session and explains a rejected token", async path => {
  const { PUT: confirm } = await import("@/app/api/auth/verification/route");
  const { POST: reset } = await import("@/app/api/auth/password/reset/route");
  const handler = path === "verification" ? confirm : reset;
  const submit = (body: object) => handler(request(`/api/auth/${path}`, body, path === "verification" ? "PUT" : "POST"));
  const input = { userId: "reader", secret: "synthetic-token", password: "new-synthetic-password" };
  const sdk = vi.spyOn(Client.prototype, "call").mockResolvedValueOnce({})
    .mockRejectedValue(new AppwriteException("Rejected secret", 401, "user_invalid_token"));
  expect((await submit(input)).status).toBe(200);
  expect(sdk.mock.contexts[0]).toMatchObject({ config: { key: "", session: "" } });
  const replay = await submit(input);
  expect(replay.status).toBe(400);
  expect((await replay.json()).error).toMatch(/expired, was already used/);
  expect((await submit({ userId: "reader" })).status).toBe(400);
  expect(sdk).toHaveBeenCalledTimes(2);
});
