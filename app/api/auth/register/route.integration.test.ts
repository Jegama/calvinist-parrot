import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { AppwriteException, Client } from "node-appwrite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

let db: PrismaClient;
const cookieStore = new Map<string, { value: string }>();
vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

const suffix = randomUUID().slice(0, 8);
const guestId = randomUUID();
const accounts = new Map<string, { $id: string; email: string; name: string; password: string }>();
const sessions = new Map<string, string>();
const guestChatId = randomUUID();
let failNextSession = false;

function form(label: string) {
  return {
    username: `${label}_${suffix}`, email: `${label}-${suffix}@example.test`,
    firstName: "Ada", lastName: "de Vries", password: "synthetic-password",
  };
}

async function register(body: ReturnType<typeof form>) {
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify(body) }));
}

describe.skipIf(!databaseUrl)("password registration through Appwrite and PostgreSQL", () => {
  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    vi.stubEnv("APPWRITE_ENDPOINT", "http://localhost/v1");
    vi.stubEnv("APPWRITE_PROJECT_ID", "test-project");
    vi.stubEnv("APPWRITE_API_KEY", "synthetic");
    vi.stubEnv("APPWRITE_ANALYTICS_READ_KEY", "synthetic-read");
    // Keep account creation, password proof and session reads separate, as on the provider.
    vi.spyOn(Client.prototype, "call").mockImplementation(async function (this: Client, method, url, _headers, data = {}) {
      const email = String(data.email).toLowerCase();
      const account = accounts.get(email);
      if (url.pathname === "/v1/account" && method.toLowerCase() === "post") {
        if (account) throw new AppwriteException("Duplicate", 409);
        const user = { $id: data.userId, name: data.name, email, password: data.password };
        accounts.set(email, user);
        return user;
      }
      if (url.pathname === "/v1/account/sessions/email") {
        if (failNextSession) { failNextSession = false; throw new Error("Lost provider response"); }
        if (!account || data.password !== account.password) throw new AppwriteException("Invalid", 401);
        const secret = randomUUID();
        sessions.set(secret, account.email);
        return { secret, userId: account.$id };
      }
      if (url.pathname.startsWith("/v1/users/")) {
        expect(this.config.key).toBe("synthetic-read");
        return [...accounts.values()].find(user => url.pathname === `/v1/users/${user.$id}`);
      }
      const session = this.config.session;
      if (url.pathname === "/v1/account/sessions/current") return sessions.delete(session);
      if (url.pathname === "/v1/account") return accounts.get(sessions.get(session) ?? "");
      throw new Error(`Unexpected Appwrite request ${method} ${url.pathname}`);
    });
  });

  afterAll(async () => {
    await db.chatHistory.deleteMany({ where: { id: guestChatId } });
    await db.userProfile.deleteMany({ where: { appwriteUserId: { in: [...accounts.values()].map(user => user.$id) } } });
    await db.$disconnect();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("resumes a partial signup, transfers the guest's chat and accepts repeated submissions", async () => {
    const body = form("resume");
    cookieStore.set("guestId", { value: guestId });
    await db.chatHistory.create({ data: {
      id: guestChatId, userId: guestId, conversationName: "Guest conversation",
      category: "", issue_type: "", subcategory: "",
    } });
    failNextSession = true;
    const partial = await register(body);
    expect(partial.status).toBe(503);
    expect(partial.headers.get("set-cookie")).toBeNull();
    expect((await db.chatHistory.findUniqueOrThrow({ where: { id: guestChatId } })).userId).toBe(guestId);

    const retry = await register({ ...body, username: body.username.toUpperCase() });
    expect(retry.status).toBe(200);
    const user = accounts.get(body.email)!;
    expect((await retry.json()).profile).toMatchObject({
      appwriteUserId: user.$id, firstName: body.firstName, lastName: body.lastName,
      displayName: "Ada de Vries", username: body.username, email: body.email,
    });
    expect((await db.chatHistory.findUniqueOrThrow({ where: { id: guestChatId } })).userId).toBe(user.$id);
    expect(retry.cookies.get("a_session_test-project")?.value).toBeTruthy();
    cookieStore.clear();

    const replay = await register({ ...body, firstName: "Different" });
    expect(replay.status).toBe(200);
    expect((await replay.json()).profile.firstName).toBe("Ada");
    expect((await register({ ...body, username: `other_${suffix}` })).status).toBe(409);
    expect((await register({ ...body, password: "wrong-password" })).status).toBe(409);
  });

  it("awards one case-insensitive handle and lets the other person register a free one", async () => {
    const first = form("concurrent");
    const second = { ...form("contender"), username: first.username.toUpperCase() };
    const results = await Promise.all([register(first), register(second)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const losingIndex = results.findIndex(result => result.status === 409);
    expect(results[losingIndex].headers.get("set-cookie")).toBeNull();
    expect(await db.userProfile.count({ where: { username: first.username } })).toBe(1);

    const losingBody = [first, second][losingIndex];
    expect((await register({ ...losingBody, username: `available_${suffix}` })).status).toBe(200);
  });

  it("uses the current email and handle after either changes", async () => {
    const body = form("rename");
    const signup = await register(body);
    expect(signup.status).toBe(200);
    const { POST: signIn } = await import("@/app/api/auth/login/route");
    const { PATCH: edit } = await import("@/app/api/user-profile/route");
    const login = (identifier: string) => signIn(new Request("http://localhost/api/auth/login", {
      method: "POST", body: JSON.stringify({ identifier, password: body.password }),
    }));
    cookieStore.set("a_session_test-project", { value: signup.cookies.get("a_session_test-project")!.value });
    const username = `changed_${suffix}`;
    const response = await edit(new Request("http://localhost/api/user-profile", {
      method: "PATCH", body: JSON.stringify({ username }),
    }));
    expect(response.status).toBe(200);
    cookieStore.clear();

    const user = accounts.get(body.email)!;
    accounts.delete(body.email);
    user.email = `new-${body.email}`;
    accounts.set(user.email, user);
    const byHandle = await login(username.toUpperCase());
    expect(byHandle.status).toBe(200);
    expect((await byHandle.json()).profile).toMatchObject({ appwriteUserId: user.$id, email: user.email, username });
    expect((await login(user.email)).status).toBe(200);
    expect((await login(body.username)).status).toBe(401);
    expect((await login(body.email)).status).toBe(401);
  });

  it("converges when the same signup arrives concurrently", async () => {
    const body = form("identical");
    const results = await Promise.all([register(body), register(body)]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(await db.userProfile.count({ where: { username: body.username } })).toBe(1);
  });
});
