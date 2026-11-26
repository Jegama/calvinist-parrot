import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as getSpace, POST as createSpace } from "./route";
import { POST as acceptInvite } from "../accept-invite/route";
import { POST as addMember } from "../members/route";
import { GET as getSync } from "../sync/route";
import { POST as addFamily, GET as getFamilies } from "../families/route";
import { PATCH as updateFamily } from "../families/[familyId]/route";
import { POST as confirmRotation } from "../rotation/confirm/route";
import { GET as getRotation } from "../rotation/route";
import { PATCH as updateRequest } from "../requests/[requestId]/route";
import { GET as getOverview } from "@/app/api/profile/overview/route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

let db: PrismaClient;
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

describe.skipIf(!databaseUrl)("household first names", () => {
  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  });
  afterAll(async () => {
    const where = { space: { createdByUserId: { in: accountIds } } };
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
});
