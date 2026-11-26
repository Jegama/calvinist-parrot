import { randomUUID } from "node:crypto";
import { AppwriteException, Client } from "node-appwrite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));
const transfer = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => new Map<string, { value: string }>());

vi.mock("@/lib/prisma", () => ({
  default: {
    userProfile: db,
    mcpAccountIdentity: { findUnique: async () => null },
    $transaction: (run: (tx: { userProfile: typeof db }) => unknown) => run({ userProfile: db }),
  },
}));
vi.mock("@/lib/chat-transfer", () => ({ transferGuestChatsToUser: transfer }));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ "user-agent": "synthetic-browser" }),
}));

const account = { $id: "reader", name: "Existing Display", email: "current@example.test" };
const guestId = randomUUID();
const session = { userId: account.$id, secret: "synthetic-session" };
const profile = { appwriteUserId: account.$id, username: "reader_name", displayName: account.name, email: account.email };
const providerCall = () => vi.spyOn(Client.prototype, "call");

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "http://localhost");
  vi.stubEnv("APPWRITE_PROJECT_ID", "synthetic-project");
  vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
  vi.stubEnv("APPWRITE_ANALYTICS_READ_KEY", "read-only-key");
  vi.stubEnv("APPWRITE_API_KEY", "session-key");
  providerCall().mockRejectedValue(new Error("Unexpected Appwrite API call"));
  cookieStore.clear();
  cookieStore.set("guestId", { value: guestId });
  db.upsert.mockResolvedValue(profile);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function serveAccount(sessionResult = session, accountResult = account) {
  providerCall().mockResolvedValueOnce(sessionResult).mockResolvedValueOnce(accountResult);
}

async function login(body: object) {
  const { POST } = await import("@/app/api/auth/login/route");
  return POST(new Request("http://localhost/api/auth/login", {
    method: "POST", body: JSON.stringify(body),
  }));
}

it("resolves the current handle and Appwrite email, authenticates with separate credentials, and transfers guest chats", async () => {
  db.findUnique.mockResolvedValue({ appwriteUserId: account.$id });
  const api = providerCall().mockResolvedValueOnce(account);
  serveAccount();
  const result = await login({ identifier: " Reader_Name ", password: "test-password" });

  expect(result.status).toBe(200);
  expect((await result.json()).profile).toEqual(profile);
  expect(result.cookies.get("a_session_synthetic-project")?.value).toBe(session.secret);
  expect(result.cookies.get("guestId")?.value).toBe("");
  expect(transfer).toHaveBeenCalledWith(guestId, "reader");
  expect(db.findUnique).toHaveBeenCalledWith({
    where: { username: "reader_name" }, select: { appwriteUserId: true },
  });
  expect(api.mock.calls[0][1].href).toBe("http://localhost/v1/users/reader");
  expect(api.mock.contexts[0]).toMatchObject({ config: { key: "read-only-key", project: "synthetic-project" } });

  expect(api.mock.calls[1][1].href).toBe("http://localhost/v1/account/sessions/email");
  expect(api.mock.calls[1][3]).toMatchObject({ email: account.email, password: "test-password" });
  expect(api.mock.contexts[1]).toMatchObject({ config: { key: "session-key", session: "" } });
  expect(api.mock.calls[2][1].href).toBe("http://localhost/v1/account");
  expect(api.mock.contexts[2]).toMatchObject({ config: { key: "", session: session.secret } });
});

it.each(["email", "identifier"])("keeps legacy password sign-in available through %s without an assigned handle or directory key", async (field) => {
  vi.stubEnv("APPWRITE_ANALYTICS_READ_KEY", "");
  db.upsert.mockResolvedValue({ ...profile, username: null });
  serveAccount();
  const result = await login({ [field]: account.email.toUpperCase(), password: "test-password" });
  expect(result.status).toBe(200);
  expect(db.findUnique).not.toHaveBeenCalled();
  expect(db.upsert.mock.calls[0][0].where).toEqual({ appwriteUserId: account.$id });
});

it.each(["unknown", "old handle", "bad password", "directory id", "session id", "account id", "email", "renamed during login"])(
  "returns a generic invalid login without transferring chats or setting an auth cookie for %s",
  async (scenario) => {
    const username = scenario === "old handle" ? "previous_name" : "reader_name";
    db.findUnique.mockResolvedValue(["unknown", "old handle"].includes(scenario) ? null : { appwriteUserId: account.$id });
    providerCall().mockResolvedValueOnce({ ...account, $id: scenario === "directory id" ? "other" : account.$id });
    if (scenario === "bad password") {
      providerCall().mockRejectedValueOnce(new AppwriteException("Provider-specific error", 401));
    } else {
      const returnedUser = { ...account, $id: scenario === "account id" ? "other" : account.$id };
      if (scenario === "email") returnedUser.email = "changed@example.test";
      serveAccount({ ...session, userId: scenario === "session id" ? "other" : returnedUser.$id }, returnedUser);
      providerCall().mockResolvedValue({}); // revoke an unusable session
    }
    if (scenario === "renamed during login") db.upsert.mockResolvedValue({ ...profile, username: "new_name" });

    const result = await login({ identifier: username, password: "test-password" });
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "Invalid email or username and password." });
    expect(result.headers.get("set-cookie")).toBeNull();
    expect(transfer).not.toHaveBeenCalled();
    if (["renamed during login", "session id", "account id", "email"].includes(scenario)) {
      expect(providerCall().mock.calls.at(-1)?.[1].pathname).toBe("/v1/account/sessions/current");
      expect(providerCall().mock.contexts.at(-1)).toMatchObject({ config: { key: "", session: session.secret } });
    }
  },
);

it.each(["unknown@example.test", "unclaimed_handle"])("limits repeated attempts for %s, including case variants", async (identifier) => {
  db.findUnique.mockResolvedValue(null);
  providerCall().mockRejectedValue(new AppwriteException("Invalid credentials", 401));
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await login({ identifier, password: "test-password" });
    expect(result.status).toBe(401);
  }
  const limited = await login({ identifier: identifier.toUpperCase(), password: "test-password" });
  expect(limited.status).toBe(429);
  expect(transfer).not.toHaveBeenCalled();
});

it("rejects an oversized registration identifier before the limiter or any account lookup", async () => {
  const rateLimit = await import("@/lib/rate-limit");
  const limiter = vi.spyOn(rateLimit, "passwordAuthRateLimited");
  const { POST } = await import("@/app/api/auth/register/route");
  const response = await POST(new Request("http://localhost/api/auth/register", {
    method: "POST", body: JSON.stringify({ email: "a".repeat(321) }),
  }));
  expect(response.status).toBe(400);
  expect(limiter).not.toHaveBeenCalled();
  expect(db.findUnique).not.toHaveBeenCalled();
  expect(providerCall()).not.toHaveBeenCalled();
});

it.each([
  { intent: "signup", existing: false, expectedTransfer: true },
  { intent: "signup", existing: true, expectedTransfer: false },
  { intent: "login", existing: true, expectedTransfer: false },
])("keeps Google $intent working for existing=$existing with its guest transfer policy", async ({ intent, existing, expectedTransfer }) => {
  cookieStore.set("authIntent", { value: intent });
  vi.stubEnv("APP_URL", "https://preview.example.test");
  db.findUnique.mockResolvedValue(existing ? profile : null);
  serveAccount();
  const { GET } = await import("@/app/api/auth/oauth/google/callback/route");
  const result = await GET(new Request("http://localhost/api/auth/oauth/google/callback?userId=reader&secret=synthetic-token"));
  expect(result.headers.get("location")).toBe("https://preview.example.test/auth/complete");
  expect(result.cookies.get("a_session_synthetic-project")?.value).toBe(session.secret);
  expect(transfer).toHaveBeenCalledTimes(expectedTransfer ? 1 : 0);
});


it.each(["lookup", "sync", "transfer"])("revokes the verified Google session after failed %s", async (stage) => {
  cookieStore.set("authIntent", { value: "signup" });
  db.findUnique.mockResolvedValue(null);
  vi.stubEnv("APP_URL", "http://localhost");
  const failure = new Error("Unable to complete signup");
  if (stage === "lookup") db.findUnique.mockRejectedValue(failure);
  if (stage === "sync") db.upsert.mockRejectedValue(failure);
  if (stage === "transfer") transfer.mockRejectedValue(failure);
  serveAccount();
  const api = providerCall().mockResolvedValue({});
  const { GET } = await import("@/app/api/auth/oauth/google/callback/route");
  const result = await GET(new Request("http://localhost/api/auth/oauth/google/callback?userId=reader&secret=synthetic-token"));
  expect(result.headers.get("location")).toBe("http://localhost/register?oauth=failed");
  expect(result.cookies.get("a_session_synthetic-project")).toBeUndefined();
  expect(result.cookies.get("guestId")).toBeUndefined();
  expect(api.mock.calls.at(-1)?.[0]).toBe("delete");
  expect(api.mock.calls.at(-1)?.[1].pathname).toBe("/v1/account/sessions/current");
  expect(api.mock.contexts.at(-1)).toMatchObject({ config: { key: "", session: session.secret } });
});

it("revokes an unissued session after a profile write fails", async () => {
  db.upsert.mockRejectedValue(new Error("Database unavailable"));
  serveAccount();
  providerCall().mockResolvedValue({});
  const result = await login({ identifier: account.email, password: "test-password" });
  expect(result.status).toBe(503);
  expect(result.headers.get("set-cookie")).toBeNull();
  expect(transfer).not.toHaveBeenCalled();
  expect(providerCall().mock.calls.at(-1)?.[1].pathname).toBe("/v1/account/sessions/current");
});

it("starts Google signup with the configured callbacks and saves its intent", async () => {
  vi.stubEnv("APP_URL", "http://localhost");
  const redirect = vi.spyOn(Client.prototype, "redirect").mockResolvedValue("https://accounts.example.test/authorize");
  const { GET } = await import("@/app/api/auth/oauth/google/start/route");
  const result = await GET(new Request("http://localhost/api/auth/oauth/google/start?intent=signup"));
  expect(result.headers.get("location")).toBe("https://accounts.example.test/authorize");
  expect(result.cookies.get("authIntent")?.value).toBe("signup");
  expect(redirect.mock.calls[0][1].pathname).toBe("/v1/account/tokens/oauth2/google");
  expect(redirect.mock.calls[0][3]).toMatchObject({
    success: "http://localhost/api/auth/oauth/google/callback",
    failure: "http://localhost/register?oauth=failed",
  });
});

it("preserves the password recovery and reset requests through the server SDK", async () => {
  vi.stubEnv("APP_URL", "http://localhost");
  const api = providerCall().mockResolvedValue({});
  const { POST: recover } = await import("@/app/api/auth/password/recovery/route");
  const { POST: reset } = await import("@/app/api/auth/password/reset/route");
  const recovery = await recover(new Request("http://localhost/api/auth/password/recovery", {
    method: "POST", body: JSON.stringify({ email: account.email }),
  }));
  const fields = { userId: account.$id, secret: "reset-secret", password: "updated-password" };
  const updated = await reset(new Request("http://localhost/api/auth/password/reset", {
    method: "POST", body: JSON.stringify(fields),
  }));
  expect([recovery.status, updated.status]).toEqual([200, 200]);
  expect(api.mock.calls.map(([method, url, , body]) => [method, url.pathname, body])).toEqual([
    ["post", "/v1/account/recovery", { email: account.email, url: "http://localhost/reset-password" }],
    ["put", "/v1/account/recovery", fields],
  ]);
});

it("creates a sermon upload JWT and signs out using only the current session", async () => {
  vi.stubEnv("SERMON_RUNTIME", "appwrite");
  cookieStore.set("a_session_synthetic-project", { value: session.secret });
  const api = providerCall().mockResolvedValueOnce({ jwt: "upload-jwt" }).mockResolvedValueOnce({});
  const { createSermonUploadJwt } = await import("@/lib/sermon-evaluation/appwrite");
  expect(await createSermonUploadJwt()).toBe("upload-jwt");
  const { POST } = await import("@/app/api/auth/logout/route");
  const response = await POST();
  expect(response.cookies.get("a_session_synthetic-project")?.value).toBe("");
  expect(api.mock.calls.map(([method, url]) => [method, url.pathname])).toEqual([
    ["post", "/v1/account/jwts"], ["delete", "/v1/account/sessions/current"],
  ]);
  for (const context of api.mock.contexts) {
    expect(context).toMatchObject({ config: { key: "", session: session.secret } });
  }
});
