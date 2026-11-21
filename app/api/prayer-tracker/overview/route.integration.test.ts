import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getRequests } from "../requests/route";
import { GET as getOverview } from "./route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI
  ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

const spaceId = randomUUID();
const otherSpaceId = randomUUID();
const userId = `overview-user-${spaceId}`;
let prisma: PrismaClient;

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: async () => ({ userId, errorResponse: null }),
}));
vi.mock("@/lib/prisma", () => ({
  get default() { return prisma; },
}));

describe.skipIf(!databaseUrl)("prayer request totals", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  });

  afterAll(async () => {
    const spaceFilter = { spaceId: { in: [spaceId, otherSpaceId] } };
    await prisma.$transaction([
      prisma.prayerFamilyRequest.deleteMany({ where: { family: spaceFilter } }),
      prisma.prayerFamily.deleteMany({ where: spaceFilter }),
      prisma.prayerPersonalRequest.deleteMany({ where: spaceFilter }),
      prisma.prayerMember.deleteMany({ where: spaceFilter }),
      prisma.userProfile.deleteMany({ where: { appwriteUserId: userId } }),
      prisma.prayerFamilySpace.deleteMany({ where: { id: spaceFilter.spaceId } }),
    ]);
    await prisma.$disconnect();
  });

  it("counts visible requests from archived families in the household overview", async () => {
    await prisma.userProfile.create({ data: { appwriteUserId: userId, displayName: "Member" } });
    await prisma.prayerFamilySpace.create({
      data: {
        id: spaceId, spaceName: "Household", shareCode: spaceId, createdByUserId: userId,
        members: { create: { displayName: "Member", appwriteUserId: userId } },
        personalRequests: { create: { requestText: "Household active" } },
        families: { create: {
          familyName: "Archived family", parents: "", children: [], archivedAt: new Date(),
          requests: { create: [
            { status: "ACTIVE", requestText: "Family active" },
            { status: "ANSWERED", requestText: "Family answered" },
            { status: "ARCHIVED", requestText: "Archived request" },
          ] },
        } },
      },
    });
    await prisma.prayerFamilySpace.create({
      data: {
        id: otherSpaceId, spaceName: "Other household", shareCode: otherSpaceId, createdByUserId: otherSpaceId,
        families: { create: {
          familyName: "Other family", parents: "", children: [],
          requests: { create: [
            { status: "ACTIVE", requestText: "Other active" },
            { status: "ANSWERED", requestText: "Other answered" },
          ] },
        } },
      },
    });

    const requests = await (await getRequests()).json() as Array<{ requestText: string }>;
    expect(requests.map((request) => request.requestText).sort()).toEqual([
      "Family active", "Family answered", "Household active",
    ]);
    const overview = await (await getOverview()).json();
    expect(overview.stats.prayer).toMatchObject({
      householdActive: 1, familyActive: 1, totalActive: 2, totalAnswered: 1,
    });
  });
});
