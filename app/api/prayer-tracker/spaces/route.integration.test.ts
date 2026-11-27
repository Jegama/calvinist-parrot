import { randomUUID } from "node:crypto";
import { createAppPrismaClient } from "@/lib/prisma-client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DELETE as leaveSpace, GET as getSpace, PATCH as renameSpace, POST as createSpace } from "./route";
import { DELETE as deleteHousehold } from "./delete-household/route";
import { POST as invite } from "../invite/route";
import { POST as acceptInvite } from "../accept-invite/route";
import { PATCH as updateMember, POST as addMember } from "../members/route";
import { GET as getSync } from "../sync/route";
import { POST as addFamily, GET as getFamilies } from "../families/route";
import { DELETE as deleteFamily, PATCH as updateFamily } from "../families/[familyId]/route";
import { POST as confirmRotation } from "../rotation/confirm/route";
import { GET as getRotation } from "../rotation/route";
import { POST as postJournal } from "../journal/route";
import { POST as addFamilyRequest } from "../families/[familyId]/requests/route";
import { POST as addRequest } from "../requests/route";
import { DELETE as deleteRequest, PATCH as updateRequest } from "../requests/[requestId]/route";
import { GET as getOverview } from "@/app/api/profile/overview/route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

let db: ReturnType<typeof createAppPrismaClient>;
let userId: string;
const accountIds: string[] = [];
vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: async () => ({
    userId, user: { $id: userId, name: "Provider Name", email: `${userId}@example.test` }, errorResponse: null,
  }),
}));

function account() {
  const id = randomUUID();
  accountIds.push(id);
  return id;
}

function request(body?: object, method = "POST") {
  return body ? new Request("http://localhost", { method, body: JSON.stringify(body) }) : new Request("http://localhost");
}

async function json(response: Promise<Response>) {
  const result = await response;
  expect(result.ok).toBe(true);
  return result.json();
}

// Poll through the public handler after each operation, just as a household member does.
async function trackRevision(spaceId: string) {
  async function read() {
    const sync = await json(getSync());
    expect(sync.spaceId).toBe(spaceId);
    expect(sync.version).toMatch(/^\d+$/);
    return BigInt(sync.version);
  }
  let previous = await read();
  return async (delta = 1) => {
    const current = await read();
    expect(current).toBe(previous + BigInt(delta));
    previous = current;
  };
}

describe.skipIf(!databaseUrl)("household prayer tracking", () => {
  beforeAll(() => {
    db = createAppPrismaClient(databaseUrl!);
  });
  afterAll(async () => {
    const where = { space: { createdByUserId: { in: accountIds } } };
    await db.prayerJournalEntry.deleteMany({ where });
    await db.prayerFamilyRequest.deleteMany({ where: { family: where } });
    await db.prayerPersonalRequest.deleteMany({ where });
    await db.prayerFamily.deleteMany({ where });
    await db.prayerMember.deleteMany({ where });
    await db.userProfile.deleteMany({ where: { appwriteUserId: { in: accountIds } } });
    await db.prayerFamilySpace.deleteMany({ where: { createdByUserId: { in: accountIds } } });
    await db.$disconnect();
  });

  it("resolves both adults' current first names across household views and preserves confirmed attribution", async () => {
    const owner = account();
    const invited = account();
    await db.userProfile.createMany({ data: [
      { appwriteUserId: owner, firstName: "Helene", lastName: "Lee", displayName: "Helene Lee" },
      { appwriteUserId: invited, firstName: "Anne Marie", displayName: "Anne Marie Smith" },
    ] });
    userId = owner;
    const { space, membership: creator } = await json(createSpace(request({ spaceName: "Our household", displayName: "Old label" })));
    expect(creator.displayName).toBe("Helene");
    const child = await json(addMember(request({ displayName: "Little Sparrow" })));
    userId = invited;
    const { membership: partner } = await json(acceptInvite(request({ shareCode: space.shareCode })));
    expect(partner.displayName).toBe("Anne Marie");
    const family = await json(addFamily(request({ familyName: "A family" })));
    await json(confirmRotation(request({ familyAssignments: [{ familyId: family.id, prayedByMemberId: creator.id }] })));

    const previous = await json(getSync());
    await db.userProfile.update({ where: { appwriteUserId: owner }, data: { firstName: "Hélène" } });
    const renamed = await json(getSync());
    expect(renamed.version).toBe(previous.version);
    expect(renamed.nameVersion).not.toBe(previous.nameVersion);

    for (const viewer of [owner, invited]) {
      userId = viewer;
      const members = expect.arrayContaining([
        expect.objectContaining({ id: creator.id, displayName: "Hélène", role: "OWNER" }),
        expect.objectContaining({ id: partner.id, displayName: "Anne Marie", role: "MEMBER" }),
        expect.objectContaining({ id: child.id, displayName: "Little Sparrow", appwriteUserId: null }),
      ]);
      for (const handler of [getSpace, getOverview]) {
        const data = await json(handler(request()));
        expect(data.space).toMatchObject({ spaceName: "Our household", members });
        expect(data.membership.displayName).toBe(viewer === owner ? "Hélène" : "Anne Marie");
      }
      const rotation = await json(getRotation(request()));
      expect(rotation.members).toEqual(members);
      const attribution = { id: creator.id, displayName: "Hélène" };
      expect(rotation.families[0].lastPrayedBy).toEqual(attribution);
      expect((await json(getFamilies(request())))[0].lastPrayedBy).toEqual(attribution);
    }
    const changedFamily = await json(updateFamily(request({ parents: "Both" }, "PATCH"), { params: Promise.resolve({ familyId: family.id }) }));
    expect(changedFamily.lastPrayedBy).toEqual({ id: creator.id, displayName: "Hélène" });

    const beforeEdit = await json(getSync());
    expect(beforeEdit.version).not.toBe(renamed.version);
    for (const edit of [{ lastName: "New" }, { username: `user_${owner.slice(0, 8)}` }]) {
      await db.userProfile.update({ where: { appwriteUserId: owner }, data: edit });
      expect(await json(getSync())).toEqual(beforeEdit);
      expect((await json(getFamilies(request())))[0].lastPrayedBy.displayName).toBe("Hélène");
    }
  });

  it("uses the existing default or saved household label for accounts without a first name", async () => {
    const owner = account();
    const invited = account();
    userId = owner;
    const { space, membership: creator } = await json(createSpace(request({ spaceName: "Legacy family" })));
    expect(creator.displayName).toBe("You");
    userId = invited;
    await db.userProfile.create({ data: { appwriteUserId: invited, displayName: "Legacy Full Name", lastName: "Lee" } });
    expect((await json(acceptInvite(request({ shareCode: space.shareCode, displayName: " " })))).membership.displayName).toBe("Spouse");
    await db.prayerMember.update({ where: { id: creator.id }, data: { displayName: "Dad" } });
    userId = owner;
    expect((await json(createSpace(request({})))).membership.displayName).toBe("Dad");

    const pending = await db.prayerPersonalRequest.create({ data: { spaceId: space.id, requestText: "Test request" } });
    userId = invited;
    const flowId = randomUUID();
    const receiptId = vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(flowId);
    try {
      await json(updateRequest(request({ isHouseholdRequest: true, markAnswered: true }, "PATCH"), { params: Promise.resolve({ requestId: pending.id }) }));
    } finally {
      receiptId.mockRestore();
      await db.analyticsEngagementEvent.deleteMany({ where: { flowId } });
    }
    expect(await db.userProfile.findUniqueOrThrow({ where: { appwriteUserId: owner } })).toMatchObject({
      displayName: "User", firstName: null, answeredPersonalCount: 1,
    });
    expect(await db.userProfile.findUniqueOrThrow({ where: { appwriteUserId: invited } })).toMatchObject({
      displayName: "Legacy Full Name", lastName: "Lee", answeredPersonalCount: 1,
    });
    expect((await json(getSpace(request()))).space.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: creator.id, displayName: "Dad" }),
    ]));
  });

  it("tracks space, invite and member changes and stops reporting a departed household", async () => {
    const owner = account();
    const partner = account();
    userId = owner;
    const empty = { spaceId: null, version: null, nameVersion: null };
    expect(await json(getSync())).toEqual(empty);
    const { space } = await json(createSpace(request({ spaceName: "First home" })));
    const spaceId: string = space.id;
    const changed = await trackRevision(spaceId);

    await json(createSpace(request({})));
    await json(invite(request({})));
    await changed(0);
    await json(renameSpace(request({ spaceId, spaceName: "New home" }, "PATCH")));
    await changed();
    const { shareCode } = await json(invite(request({ regenerate: true })));
    await changed();

    userId = partner;
    const joined = await json(acceptInvite(request({ shareCode })));
    await changed();
    await json(acceptInvite(request({ shareCode })));
    await changed(0);
    userId = owner;
    const child = await json(addMember(request({ displayName: "Youngest" })));
    await changed();
    await json(updateMember(request({ memberId: child.id }, "PATCH")));
    await changed(0);
    await json(updateMember(request({ memberId: child.id, assignmentCapacity: 3 }, "PATCH")));
    await changed();
    await json(leaveSpace(request({ spaceId, removeMemberId: child.id }, "DELETE")));
    await changed();

    await json(leaveSpace(request({ spaceId, transferToMemberId: joined.membership.id }, "DELETE")));
    expect(await json(getSync())).toEqual(empty);
    userId = partner;
    await changed();
    userId = owner;
    await json(acceptInvite(request({ shareCode })));
    await changed();
    await json(leaveSpace(request({ spaceId }, "DELETE")));
    expect(await json(getSync())).toEqual(empty);
    userId = partner;
    await changed();
    await json(deleteHousehold(request({ spaceId }, "DELETE")));
    expect(await json(getSync())).toEqual(empty);
  });

  it("increments once for each prayer mutation, including multi-row confirmations, moves, and deletes", async () => {
    userId = account();
    const { space, membership } = await json(createSpace(request({})));
    const changed = await trackRevision(space.id);
    const family = await json(addFamily(request({ familyName: "Friend" })));
    const familyContext = { params: Promise.resolve({ familyId: family.id }) };
    await changed();
    await json(updateFamily(request({ familyName: "Friends" }, "PATCH"), familyContext));
    await changed();

    const personal = await json(addRequest(request({ requestText: "Household prayer" })));
    const requestContext = (requestId: string) => ({ params: Promise.resolve({ requestId }) });
    await changed();
    const familyRequest = await json(addRequest(request({ requestText: "Family prayer", linkedToFamily: family.id })));
    await changed();
    await json(addFamilyRequest(request({ requestText: "Another prayer" }), familyContext));
    await changed();
    await json(updateRequest(request({ isHouseholdRequest: true, notes: "Update" }, "PATCH"), requestContext(personal.id)));
    await changed();
    await json(updateRequest(request({ isHouseholdRequest: false, notes: "Update" }, "PATCH"), requestContext(familyRequest.id)));
    await changed();

    await json(confirmRotation(request({})));
    await changed(0);
    await json(confirmRotation(request({
      personalIds: [personal.id], familyAssignments: [{ familyId: family.id, prayedByMemberId: membership.id }],
    })));
    await changed();

    const move = (id: string, from: string, to: string) => updateRequest(
      request({ originalLinkedToFamily: from, linkedToFamily: to }, "PATCH"), requestContext(id),
    );
    expect((await move(personal.id, "household", randomUUID())).status).toBe(404);
    await changed(0);
    const moved = await json(move(personal.id, "household", family.id));
    expect(moved).toMatchObject({ familyId: family.id, requestText: "Household prayer" });
    await changed();
    const movedBack = await json(move(moved.id, family.id, "household"));
    expect(movedBack).toMatchObject({ familyId: null, requestText: "Household prayer" });
    await changed();
    await json(deleteRequest(request({ isHouseholdRequest: true }, "DELETE"), requestContext(movedBack.id)));
    await changed();
    await json(deleteRequest(request({ isHouseholdRequest: false }, "DELETE"), requestContext(familyRequest.id)));
    await changed();
    await json(deleteFamily(request({}, "DELETE"), familyContext));
    await changed();
    await json(postJournal(request({ entryText: "A household prayer" })));
    await changed();
  });

  it("preserves exact revisions for concurrent writes and isolates other households", async () => {
    const other = account();
    userId = other;
    await json(createSpace(request({})));
    const otherSnapshot = await json(getSync());
    userId = account();
    const { space } = await json(createSpace(request({})));
    await db.prayerFamilySpace.update({ where: { id: space.id }, data: { version: BigInt("9007199254740993") } });
    expect(await json(getSync())).toMatchObject({ spaceId: space.id, version: "9007199254740993" });
    const changed = await trackRevision(space.id);
    await Promise.all(["A", "B", "C"].map(familyName => json(addFamily(request({ familyName })))));
    await changed(3);
    userId = other;
    expect(await json(getSync())).toEqual(otherSnapshot);
  });

  it("rolls back a saved prayer if the revision increment fails", async () => {
    userId = account();
    const { space } = await json(createSpace(request({})));
    const maxRevision = "9223372036854775807";
    await db.prayerFamilySpace.update({ where: { id: space.id }, data: { version: BigInt(maxRevision) } });
    await expect(addFamily(request({ familyName: "Uncommitted" }))).rejects.toThrow();
    expect(await db.prayerFamily.count({ where: { spaceId: space.id } })).toBe(0);
    expect((await json(getSync())).version).toBe(maxRevision);
  });
});
