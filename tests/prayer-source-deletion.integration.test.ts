import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deletePersonalEntry } from "@/app/api/journal/entries/[id]/route";
import { DELETE as deleteHeritageEntry } from "@/app/api/kids-discipleship/logs/[id]/route";
import { DELETE as deleteHousehold } from "@/app/api/prayer-tracker/spaces/delete-household/route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

const userId = randomUUID();
const profileId = randomUUID();
const sourceSpace = randomUUID();
const linkedSpace = randomUUID();
const unrelatedSpace = randomUUID();
const spaceIds = [sourceSpace, linkedSpace, unrelatedSpace];
const childId = randomUUID();
let db: PrismaClient;

vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
vi.mock("@/lib/auth", () => ({ requireAuthenticatedUser: async () => ({ userId, errorResponse: null }) }));

async function version(spaceId: string) {
  const space = await db.prayerFamilySpace.findUniqueOrThrow({ where: { id: spaceId }, select: { version: true } });
  return space.version.toString();
}

describe.skipIf(!databaseUrl)("prayer sync after a journal source is deleted", () => {
  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  });
  beforeEach(async () => {
    await db.userProfile.create({ data: { id: profileId, appwriteUserId: userId, displayName: "Owner", journalEntriesCount: 2 } });
    await db.prayerFamilySpace.createMany({ data: spaceIds.map(id => ({
      id, spaceName: "Test household", shareCode: id, createdByUserId: userId,
    })) });
    await db.prayerMember.createMany({ data: [
      { spaceId: sourceSpace, appwriteUserId: userId, displayName: "Owner", role: "OWNER" },
      { spaceId: sourceSpace, id: childId, displayName: "Child", isChild: true },
    ] });
  });
  afterEach(async () => {
    const where = { spaceId: { in: spaceIds } };
    await db.prayerFamilyRequest.deleteMany({ where: { family: where } });
    await db.prayerFamily.deleteMany({ where });
    await db.prayerPersonalRequest.deleteMany({ where });
    await db.journalEntry.deleteMany({ where: { authorProfileId: profileId } });
    await db.prayerMember.deleteMany({ where });
    await db.prayerFamilySpace.deleteMany({ where: { id: { in: spaceIds } } });
    await db.userProfile.deleteMany({ where: { id: profileId } });
  });
  afterAll(async () => { await db.$disconnect(); });

  it.each(["PERSONAL", "DISCIPLESHIP"] as const)("only advances households losing a link to a %s entry", async entryType => {
    const entryData = { entryType, authorProfileId: profileId, spaceId: sourceSpace, subjectMemberId: entryType === "DISCIPLESHIP" ? childId : null, entryText: "Source" };
    const unlinked = await db.journalEntry.create({ data: entryData });
    const linked = await db.journalEntry.create({ data: entryData });
    const family = await db.prayerFamily.create({ data: { spaceId: sourceSpace, familyName: "Family", parents: "" } });
    const requestData = { linkedJournalEntryId: linked.id, requestText: "Prayer" };
    const familyRequest = await db.prayerFamilyRequest.create({ data: { ...requestData, familyId: family.id } });
    await db.prayerPersonalRequest.createMany({ data: [
      { ...requestData, spaceId: sourceSpace },
      ...(entryType === "PERSONAL" ? [{ ...requestData, spaceId: linkedSpace }] : []),
    ] });
    const remove = entryType === "PERSONAL" ? deletePersonalEntry : deleteHeritageEntry;
    const request = new Request("http://localhost", { method: "DELETE" });
    expect((await remove(request, { params: Promise.resolve({ id: unlinked.id }) })).status).toBe(200);
    expect(await Promise.all(spaceIds.map(version))).toEqual(["0", "0", "0"]);

    const rollback = new Error("roll back the deletion");
    await expect(db.$transaction(async tx => {
      await tx.journalEntry.delete({ where: { id: linked.id } });
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await Promise.all(spaceIds.map(version))).toEqual(["0", "0", "0"]);

    expect((await remove(request, { params: Promise.resolve({ id: linked.id }) })).status).toBe(200);
    expect(await Promise.all(spaceIds.map(version))).toEqual(["1", entryType === "PERSONAL" ? "1" : "0", "0"]);
    expect(await db.prayerFamilyRequest.findUniqueOrThrow({ where: { id: familyRequest.id } })).toMatchObject({ linkedJournalEntryId: null });
    const personal = await db.prayerPersonalRequest.findMany({ where: { spaceId: { in: spaceIds } } });
    expect(personal.map(row => row.linkedJournalEntryId)).toEqual(entryType === "PERSONAL" ? [null, null] : [null]);
  });

  it("advances the surviving household when removing the household containing its journal source", async () => {
    const source = await db.journalEntry.create({ data: { authorProfileId: profileId, spaceId: sourceSpace, entryText: "Source" } });
    const prayer = await db.prayerPersonalRequest.create({ data: { spaceId: linkedSpace, requestText: "Prayer", linkedJournalEntryId: source.id } });
    const response = await deleteHousehold(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ spaceId: sourceSpace }) }));

    expect(response.status).toBe(200);
    expect(await db.prayerFamilySpace.findUnique({ where: { id: sourceSpace } })).toBeNull();
    expect(await version(linkedSpace)).toBe("1");
    expect(await version(unrelatedSpace)).toBe("0");
    expect(await db.prayerPersonalRequest.findUniqueOrThrow({ where: { id: prayer.id } })).toMatchObject({ linkedJournalEntryId: null });
  });
});
