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
const accounts = new Map<string, { $id: string; email: string; name: string; password: string; passwordUpdate: string; emailVerification: boolean }>();
const sessions = new Map<string, string>();
const guestChatId = randomUUID();
let failNextSession = false;
const sentMail: string[] = [];
const failedMail = new Set<string>();

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
    vi.stubEnv("APP_URL", "http://localhost");
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
        const user = { $id: data.userId, name: data.name, email, password: data.password, passwordUpdate: new Date().toISOString(), emailVerification: false };
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
      if (url.pathname === "/v1/account/email") {
        const oldEmail = sessions.get(session);
        const user = oldEmail && accounts.get(oldEmail);
        if (!user || user.password !== data.password) throw new AppwriteException("Invalid", 401);
        accounts.delete(oldEmail);
        user.email = email;
        user.emailVerification = false;
        accounts.set(email, user);
        for (const [secret, address] of sessions) {
          if (address === oldEmail) sessions.set(secret, email);
        }
        return user;
      }
      if (url.pathname === "/v1/account/verifications/email") {
        const recipient = sessions.get(session);
        if (!recipient || failedMail.has(recipient)) throw new AppwriteException("Mail unavailable", 503);
        expect(this.config.key).toBe("");
        expect(data.url).toBe("http://localhost/verify-email");
        sentMail.push(recipient);
        return {};
      }
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
    expect(await byHandle.json()).toMatchObject({ verificationEmailSent: true, profile: { appwriteUserId: user.$id, email: user.email, username } });
    expect((await login(user.email)).status).toBe(200);
    expect((await login(body.username)).status).toBe(401);
    expect((await login(body.email)).status).toBe(401);
    expect(sentMail.filter(to => to === body.email)).toHaveLength(1);
    expect(sentMail.filter(to => to === user.email)).toHaveLength(1);
  });

  it("converges when the same signup arrives concurrently", async () => {
    const body = form("identical");
    const results = await Promise.all([register(body), register(body)]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(await db.userProfile.count({ where: { username: body.username } })).toBe(1);
    expect(await Promise.all(results.map(async r => (await r.json()).verificationEmailSent))).toEqual([true, true]);
    expect(sentMail.filter(to => to === body.email)).toHaveLength(1);
  });

  it("discards invalidated receipts through A to B to A while verification mail is unavailable", async () => {
    const body = form("mailcycle");
    const signup = await register(body);
    expect((await signup.json()).verificationEmailSent).toBe(true);
    cookieStore.set("a_session_test-project", { value: signup.cookies.get("a_session_test-project")!.value });
    const { PATCH: edit } = await import("@/app/api/auth/account/route");
    const { GET: me } = await import("@/app/api/auth/me/route");
    const alternate = "new-" + body.email;
    failedMail.add(alternate);
    failedMail.add(body.email);
    for (const email of [alternate, body.email]) {
      const result = await edit(new Request("http://localhost/api/auth/account", {
        method: "PATCH", body: JSON.stringify({ field: "email", email, currentPassword: body.password }),
      }));
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ account: { email }, verificationEmailSent: false });
      expect((await (await me()).json()).verificationEmailSent).toBe(false);
    }
    failedMail.delete(body.email);
    const { POST: login } = await import("@/app/api/auth/login/route");
    const next = await login(new Request("http://localhost/api/auth/login", {
      method: "POST", body: JSON.stringify({ identifier: body.email, password: body.password }),
    }));
    expect((await next.json()).verificationEmailSent).toBe(true);
    expect(sentMail.filter(to => to === body.email)).toHaveLength(2);
    cookieStore.clear();
  });

  it("tracks an explicit send for an older authenticated account without a local profile", async () => {
    const body = form("legacy");
    const user = { $id: randomUUID(), email: body.email, name: "Legacy Name", password: body.password, passwordUpdate: "", emailVerification: false };
    accounts.set(user.email, user);
    const secret = randomUUID();
    sessions.set(secret, user.email);
    cookieStore.set("a_session_test-project", { value: secret });
    const { POST: resend } = await import("@/app/api/auth/verification/route");
    const { GET: me } = await import("@/app/api/auth/me/route");
    expect((await (await resend()).json()).verificationEmailSent).toBe(true);
    expect(await db.userProfile.findUnique({ where: { appwriteUserId: user.$id } })).toMatchObject({ displayName: user.name, email: user.email });
    expect((await (await me()).json()).verificationEmailSent).toBe(true);
    const { POST: login } = await import("@/app/api/auth/login/route");
    const next = await login(new Request("http://localhost/api/auth/login", {
      method: "POST", body: JSON.stringify({ identifier: body.email, password: body.password }),
    }));
    expect((await next.json()).verificationEmailSent).toBe(true);
    expect(sentMail.filter(to => to === user.email)).toHaveLength(1);
    cookieStore.clear();
  });

  it("keeps sign-in available after an SMTP failure, retries once across concurrent logins, and reports the accepted send across sessions", async () => {
    const body = form("retrymail");
    failedMail.add(body.email);
    const signup = await register(body);
    expect(signup.status).toBe(200);
    expect(signup.cookies.get("a_session_test-project")).toBeTruthy();
    expect((await signup.json()).verificationEmailSent).toBe(false);
    const user = accounts.get(body.email)!;
    expect(await db.accountVerificationEmail.count({ where: { appwriteUserId: user.$id } })).toBe(0);
    failedMail.delete(body.email);
    const { POST: login } = await import("@/app/api/auth/login/route");
    const signIn = (identifier: string) => login(new Request("http://localhost/api/auth/login", {
      method: "POST", body: JSON.stringify({ identifier, password: body.password }),
    }));
    const logins = await Promise.all([signIn(body.email), signIn(body.username), signIn(body.username)]);
    for (const result of logins) {
      expect(result.status).toBe(200);
      expect((await result.json()).verificationEmailSent).toBe(true);
    }
    expect(sentMail.filter(to => to === body.email)).toHaveLength(1);
    const { GET: me } = await import("@/app/api/auth/me/route");
    for (const login of logins) {
      cookieStore.set("a_session_test-project", { value: login.cookies.get("a_session_test-project")!.value });
      expect((await (await me()).json()).verificationEmailSent).toBe(true);
    }
    const { POST: resend } = await import("@/app/api/auth/verification/route");
    expect((await (await resend()).json()).verificationEmailSent).toBe(true);
    expect(sentMail.filter(to => to === body.email)).toHaveLength(2);
    // A verified account does not send, even when it has no receipt.
    await db.accountVerificationEmail.delete({ where: { appwriteUserId: user.$id } });
    user.emailVerification = true;
    expect((await (await signIn(body.username)).json()).verificationEmailSent).toBe(false);
    expect((await (await me()).json()).verificationEmailSent).toBe(false);
    expect(sentMail.filter(to => to === body.email)).toHaveLength(2);
    cookieStore.clear();
  });
});
