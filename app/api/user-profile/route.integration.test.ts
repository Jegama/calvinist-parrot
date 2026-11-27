import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH, POST } from "./route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

const currentUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: currentUser }));
vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
let db: PrismaClient;
const accountIds: string[] = [];

function syntheticUser() {
  const $id = randomUUID();
  accountIds.push($id);
  return { $id, name: "Provider name", email: `${$id}@example.test` };
}

function send(handler: (request: Request) => Promise<Response>, method: string, body: unknown) {
  return handler(new Request("http://localhost/api/user-profile", { method, body: JSON.stringify(body) }));
}

beforeEach(() => {
  currentUser.mockReset();
});

it("requires a session to read, sync, or edit a profile", async () => {
  currentUser.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await send(POST, "POST", { email: "forged@example.test" })).status).toBe(401);
  expect((await send(PATCH, "PATCH", { username: "user" })).status).toBe(401);
});

it.each([
  { username: "test@example.com" }, { username: "ab" }, { username: "Kate" },
  { firstName: " " }, { lastName: "a".repeat(65) }, { denomination: "unlisted" },
  { email: "submitted@example.test" },
])("rejects invalid or uneditable fields: %j", async (body) => {
  currentUser.mockResolvedValue(syntheticUser());
  expect((await send(PATCH, "PATCH", body)).status).toBe(400);
});

describe.skipIf(!databaseUrl)("profile edits in PostgreSQL", () => {
  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  });

  afterAll(async () => {
    await db.userProfile.deleteMany({ where: { appwriteUserId: { in: accountIds } } });
    await db.$disconnect();
  });

  it("prefills missing Google name claims and preserves subsequent member edits at sign-in", async () => {
    const user = syntheticUser();
    currentUser.mockResolvedValue(user);
    const { upsertUserProfileFromAppwriteUser } = await import("@/lib/user-profile");
    const signIn = (firstName: string | null, lastName: string | null) =>
      upsertUserProfileFromAppwriteUser(user, undefined, { firstName, lastName });

    await expect(signIn("Elena", "de la Cruz")).resolves.toMatchObject({
      firstName: "Elena", lastName: "de la Cruz", displayName: "Elena de la Cruz",
    });
    expect((await send(PATCH, "PATCH", { firstName: "Hélène" })).status).toBe(200);
    await expect(signIn("Elena", "Other")).resolves.toMatchObject({
      firstName: "Hélène", lastName: "de la Cruz", displayName: "Hélène de la Cruz",
    });
  });

  it("retains the legacy display name for a partial Google claim and fills only missing parts later", async () => {
    const user = syntheticUser();
    currentUser.mockResolvedValue(user);
    await db.userProfile.create({ data: {
      appwriteUserId: user.$id, email: user.email, displayName: "Saved display name",
    } });
    const { upsertUserProfileFromAppwriteUser } = await import("@/lib/user-profile");
    await expect(upsertUserProfileFromAppwriteUser(user, undefined, { firstName: "Ángel", lastName: null }))
      .resolves.toMatchObject({ firstName: "Ángel", lastName: null, displayName: "Saved display name" });
    expect((await send(PATCH, "PATCH", { firstName: "Angelito" })).status).toBe(200);
    await expect(upsertUserProfileFromAppwriteUser(user, undefined, { firstName: "Ángel", lastName: "Vega" }))
      .resolves.toMatchObject({ firstName: "Angelito", lastName: "Vega", displayName: "Angelito Vega" });
  });

  it("preserves a legacy display name, refreshes the authoritative email and allows an independent claim", async () => {
    const user = syntheticUser();
    currentUser.mockResolvedValue(user);
    const where = { appwriteUserId: user.$id };
    await db.userProfile.create({ data: { ...where, displayName: "A family of readers", email: "stale@example.test" } });

    const sync = await send(POST, "POST", { name: "Incorrect", email: "forged@example.test", appwriteUserId: "other" });
    expect(await sync.json()).toMatchObject({
      ...where, email: user.email, displayName: "A family of readers", username: null, firstName: null, lastName: null,
    });

    const username = `Reader_${user.$id.slice(0, 8)}`;
    expect((await send(PATCH, "PATCH", { username, denomination: "lutheran" })).status).toBe(200);
    expect(await (await GET()).json()).toMatchObject({
      ...where, username: username.toLowerCase(), firstName: null, lastName: null,
      displayName: "A family of readers", denomination: "lutheran",
    });
  });

  it.each([
    { email: null, firstName: null, expected: "Provider name" },
    { email: "previous@example.test", firstName: null, expected: "User" },
    { email: null, firstName: "User", expected: "User" },
  ])("restores only an uninitialized User placeholder on read and sync: %j", async ({ email, firstName, expected }) => {
    const user = syntheticUser();
    currentUser.mockResolvedValue(user);
    const where = { appwriteUserId: user.$id };
    await db.userProfile.create({ data: { ...where, displayName: "User", email, firstName } });
    expect(await (await GET()).json()).toMatchObject({ displayName: expected });
    expect(await (await POST()).json()).toMatchObject({ displayName: expected, email: user.email });
    expect(await db.userProfile.findUniqueOrThrow({ where })).toMatchObject({
      displayName: expected, email: user.email, firstName, lastName: null,
    });
  });

  it("merges simultaneous edits to each name and retains the result across sync", async () => {
    const user = syntheticUser();
    currentUser.mockResolvedValue(user);
    const edits = await Promise.all([
      send(PATCH, "PATCH", { firstName: "  Ana María " }),
      send(PATCH, "PATCH", { lastName: "de la Cruz" }),
    ]);
    expect(edits.map(edit => edit.status)).toEqual([200, 200]);
    expect(await (await POST()).json()).toMatchObject({
      firstName: "Ana María", lastName: "de la Cruz", displayName: "Ana María de la Cruz",
    });
  });

  it("allows exactly one case-insensitive claim and rolls back the losing edit", async () => {
    const owner = syntheticUser();
    const other = syntheticUser();
    await db.userProfile.createMany({ data: [owner, other].map(user => ({
      appwriteUserId: user.$id, displayName: "Legacy", email: user.email,
    })) });
    const username = `Reader_${owner.$id.slice(0, 8)}`;
    currentUser.mockResolvedValueOnce(owner).mockResolvedValueOnce(other);
    const claims = await Promise.all([
      send(PATCH, "PATCH", { username, firstName: "Winner" }),
      send(PATCH, "PATCH", { username: username.toUpperCase(), firstName: "Winner" }),
    ]);
    expect(claims.map(response => response.status).sort()).toEqual([200, 409]);
    const loser = claims[0].status === 409 ? owner : other;
    expect(await db.userProfile.findUnique({ where: { appwriteUserId: loser.$id } })).toMatchObject({
      displayName: "Legacy", username: null, firstName: null,
    });
    await expect(db.userProfile.update({
      where: { appwriteUserId: loser.$id }, data: { username },
    })).rejects.toThrow();
  });
  it("keeps the confirmed email after delayed login and edit snapshots, including a timestamp tie", async () => {
    const { upsertUserProfileFromAppwriteUser, editUserProfile, syncConfirmedEmail } = await import("@/lib/user-profile");
    const user = { ...syntheticUser(), $updatedAt: "2026-11-26T00:00:00.001Z" };
    const confirmed = { ...user, email: "changed@example.test", $updatedAt: "2026-11-26T00:00:00.002Z" };
    const readConfirmed = vi.fn().mockResolvedValue(confirmed);
    await upsertUserProfileFromAppwriteUser(user);
    await syncConfirmedEmail(confirmed, readConfirmed);
    expect((await editUserProfile(user, { firstName: "Edited" })).email).toBe(confirmed.email);
    expect((await upsertUserProfileFromAppwriteUser({ ...user, $updatedAt: confirmed.$updatedAt })).email).toBe(confirmed.email);
    expect(readConfirmed).not.toHaveBeenCalled();
    await syncConfirmedEmail({ ...confirmed, email: "delayed-confirmation@example.test" }, readConfirmed);
    expect(readConfirmed).toHaveBeenCalledOnce();
    expect(await db.userProfile.findUniqueOrThrow({ where: { appwriteUserId: user.$id } }))
      .toMatchObject({ email: confirmed.email, firstName: "Edited" });
  });

  it("keeps private spiritual history out of profile responses", async () => {
    const user = syntheticUser();
    currentUser.mockResolvedValue(user);
    await db.userProfile.create({ data: {
      appwriteUserId: user.$id, displayName: "Reader", spiritualStatus: "seeker",
      gospelPresentedAt: new Date(), gospelPresentationCount: 2,
    } });
    for (const response of [await GET(), await POST()]) {
      const profile = await response.json();
      expect(profile.displayName).toBe("Reader");
      expect(profile).not.toHaveProperty("spiritualStatus");
      expect(profile).not.toHaveProperty("gospelPresentedAt");
      expect(profile).not.toHaveProperty("gospelPresentationCount");
    }
  });

  it("records a newer account revision even when its email is unchanged", async () => {
    const { upsertUserProfileFromAppwriteUser, getUserProfileForAppwriteUser } = await import("@/lib/user-profile");
    const user = { ...syntheticUser(), $updatedAt: "2026-11-26T00:00:00.001Z" };
    await upsertUserProfileFromAppwriteUser(user);
    const latest = { ...user, $updatedAt: "2026-11-26T00:00:00.003Z" };
    await getUserProfileForAppwriteUser(latest);
    await upsertUserProfileFromAppwriteUser({ ...user, email: "intermediate@example.test", $updatedAt: "2026-11-26T00:00:00.002Z" });
    expect(await db.userProfile.findUniqueOrThrow({ where: { appwriteUserId: user.$id } }))
      .toMatchObject({ email: user.email, appwriteUpdatedAt: new Date(latest.$updatedAt) });
  });

  it("repairs a missed email mirror from an authoritative signed-in read", async () => {
    const { upsertUserProfileFromAppwriteUser, getUserProfileForAppwriteUser } = await import("@/lib/user-profile");
    const user = { ...syntheticUser(), $updatedAt: "2026-11-26T00:00:00.001Z" };
    await upsertUserProfileFromAppwriteUser(user);
    const changed = { ...user, email: "changed@example.test", $updatedAt: "2026-11-26T00:00:00.002Z" };
    expect((await getUserProfileForAppwriteUser(changed))?.email).toBe(changed.email);
    const sameMillisecond = { ...changed, email: "current-tie@example.test" };
    expect((await getUserProfileForAppwriteUser(sameMillisecond, async () => sameMillisecond))?.email)
      .toBe(sameMillisecond.email);
    expect(await db.userProfile.findUniqueOrThrow({ where: { appwriteUserId: user.$id } }))
      .toMatchObject({ email: sameMillisecond.email });
  });

});
