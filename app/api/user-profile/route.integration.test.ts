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
});
