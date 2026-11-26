import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;
const currentUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: currentUser }));
vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
let db: PrismaClient;
const accountIds: string[] = [];

it("requires a signed-in account", async () => {
  currentUser.mockResolvedValue(null);
  expect((await POST()).status).toBe(401);
});

describe.skipIf(!databaseUrl)("first-name prompt claims", () => {
  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  });
  afterAll(async () => {
    await db.userProfile.deleteMany({ where: { appwriteUserId: { in: accountIds } } });
    await db.$disconnect();
  });

  it.each(["no profile", "legacy profile", "named profile"])("handles simultaneous visits for a %s", async (kind) => {
    const appwriteUserId = randomUUID();
    accountIds.push(appwriteUserId);
    currentUser.mockResolvedValue({ $id: appwriteUserId, email: "reader@example.test", name: "Account name" });
    if (kind !== "no profile") {
      await db.userProfile.create({
        data: { appwriteUserId, firstName: kind === "named profile" ? "Léa" : null, displayName: "Saved name" },
      });
    }

    const visit = async () => (await (await POST()).json()).show;
    const devices = await Promise.all([visit(), visit()]);
    expect(devices.filter(Boolean)).toHaveLength(kind === "named profile" ? 0 : 1);
    expect(await visit()).toBe(false);
    const profile = await db.userProfile.findUniqueOrThrow({ where: { appwriteUserId } });
    expect(profile.firstNameNudgeShown).toBe(kind !== "named profile");
    expect(profile.displayName).toBe(kind === "no profile" ? "Account name" : "Saved name");
  });
});
