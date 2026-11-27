import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deletePersonalEntry } from "@/app/api/journal/entries/[id]/route";
import { DELETE as deleteHeritageEntry } from "@/app/api/kids-discipleship/logs/[id]/route";
import { PATCH as moveRequest } from "@/app/api/prayer-tracker/requests/[requestId]/route";
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

    expect(await db.prayerFamilyRequest.findUniqueOrThrow({ where: { id: familyRequest.id } })).toMatchObject({ linkedJournalEntryId: linked.id });
    const personalWhere = { spaceId: { in: spaceIds } };
    const linkedCount = entryType === "PERSONAL" ? 2 : 1;
    expect(await db.prayerPersonalRequest.count({ where: { ...personalWhere, linkedJournalEntryId: linked.id } })).toBe(linkedCount);

    expect((await remove(request, { params: Promise.resolve({ id: linked.id }) })).status).toBe(200);
    expect(await Promise.all(spaceIds.map(version))).toEqual(["1", entryType === "PERSONAL" ? "1" : "0", "0"]);
    expect(await db.prayerFamilyRequest.findUniqueOrThrow({ where: { id: familyRequest.id } })).toMatchObject({ linkedJournalEntryId: null });
    expect(await db.prayerPersonalRequest.count({ where: { ...personalWhere, linkedJournalEntryId: null } })).toBe(linkedCount);
  });

  it("commits a prayer edit while a concurrent journal delete waits for the same request", async () => {
    const source = await db.journalEntry.create({ data: { authorProfileId: profileId, entryText: "Source" } });
    const prayer = await db.prayerPersonalRequest.create({ data: { spaceId: sourceSpace, requestText: "Prayer", linkedJournalEntryId: source.id } });
    const editor = new Client({ connectionString: databaseUrl });
    const deleter = new Client({ connectionString: databaseUrl });

    await Promise.all([editor.connect(), deleter.connect()]);
    try {
      const { rows: [deletingSession] } = await deleter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      await editor.query("BEGIN");
      await editor.query("SET LOCAL lock_timeout = '2s'");
      await editor.query('UPDATE "prayerPersonalRequest" SET "requestText" = $1 WHERE id = $2', ["Edited", prayer.id]);

      // Observe the overlapping transactions before asking the editor to lock its household.
      const deletion = deleter.query('DELETE FROM "journalEntry" WHERE id = $1', [source.id])
        .then(result => result.rowCount, error => error);
      await vi.waitFor(async () => {
        const { rows: [lock] } = await editor.query<{ blocked: boolean }>(
          "SELECT pg_backend_pid() = ANY(pg_blocking_pids($1)) AS blocked", [deletingSession.pid],
        );
        expect(lock.blocked).toBe(true);
      }, { timeout: 3000, interval: 10 });

      await editor.query('UPDATE "prayerFamilySpace" SET version = version + 1 WHERE id = $1', [sourceSpace]);
      await editor.query("COMMIT");
      expect(await deletion).toBe(1);
    } finally {
      // Closing the editor also rolls back an open transaction if an assertion fails.
      await editor.end();
      await deleter.end();
    }
    expect(await version(sourceSpace)).toBe("2");
    expect(await db.prayerPersonalRequest.findUniqueOrThrow({ where: { id: prayer.id } })).toMatchObject({
      requestText: "Edited", linkedJournalEntryId: null,
    });
  });

  it.each(["household", "family"])("commits a %s request move during journal source deletion", async origin => {
    const source = await db.journalEntry.create({ data: { authorProfileId: profileId, entryText: "Source" } });
    const family = await db.prayerFamily.create({ data: { spaceId: sourceSpace, familyName: "Family", parents: "" } });
    const data = { requestText: "Prayer", linkedJournalEntryId: source.id };
    const household = origin === "household";
    const prayer = household
      ? await db.prayerPersonalRequest.create({ data: { ...data, spaceId: sourceSpace } })
      : await db.prayerFamilyRequest.create({ data: { ...data, familyId: family.id } });
    const deleter = new Client({ connectionString: databaseUrl });
    await deleter.connect();
    try {
      await deleter.query("BEGIN");
      await deleter.query('SELECT id FROM "journalEntry" WHERE id = $1 FOR UPDATE', [source.id]);
      const move = moveRequest(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({
        originalLinkedToFamily: household ? "household" : family.id,
        linkedToFamily: household ? family.id : "household",
      }) }), { params: Promise.resolve({ requestId: prayer.id }) });
      // Observe the route waiting, then let the journal's trigger lock the source request.
      await vi.waitFor(async () => {
        const { rows: [lock] } = await deleter.query<{ blocked: boolean }>(`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))) AS blocked
        `);
        expect(lock.blocked).toBe(true);
      }, { timeout: 3000, interval: 10 });
      await deleter.query('DELETE FROM "journalEntry" WHERE id = $1', [source.id]);
      await deleter.query("COMMIT");
      const response = await move;
      expect(response.status).toBe(200);
      const { id } = await response.json();
      const moved = household
        ? await db.prayerFamilyRequest.findUniqueOrThrow({ where: { id } })
        : await db.prayerPersonalRequest.findUniqueOrThrow({ where: { id } });
      expect(moved).toMatchObject({ requestText: "Prayer", linkedJournalEntryId: null });
      expect(await version(sourceSpace)).toBe("2");
    } finally {
      await deleter.end();
    }
  });

  it("advances the surviving household when removing the household containing its journal source", async () => {
    const sourceIds = [randomUUID(), randomUUID()];
    await db.journalEntry.createMany({ data: sourceIds.map(id => ({ id, authorProfileId: profileId, spaceId: sourceSpace, entryText: "Source" })) });
    await db.prayerPersonalRequest.createMany({ data: sourceIds.map(id => ({ spaceId: linkedSpace, requestText: "Prayer", linkedJournalEntryId: id })) });
    const response = await deleteHousehold(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ spaceId: sourceSpace }) }));

    expect(response.status).toBe(200);
    expect(await db.prayerFamilySpace.findUnique({ where: { id: sourceSpace } })).toBeNull();
    expect(await version(linkedSpace)).toBe("1");
    expect(await version(unrelatedSpace)).toBe("0");
    expect(await db.prayerPersonalRequest.count({ where: { spaceId: linkedSpace, linkedJournalEntryId: null } })).toBe(2);
  });
});
