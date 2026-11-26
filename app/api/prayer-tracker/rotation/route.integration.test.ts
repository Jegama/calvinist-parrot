import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import { POST } from "./confirm/route";
import { PATCH as updateRequest } from "../requests/[requestId]/route";
import { POST as observe } from "@/app/api/web/engagement/route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI
  ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
    ? process.env.TEST_DATABASE_URL
    : undefined;

const spaceId = randomUUID();
const userId = `rotation-user-${spaceId}`;
const [member1, member2, member3] = ["member-1", "member-2", "member-3"].map((name) => `${spaceId}-${name}`);
const [a, b, c, d, e, f, archived] = ["A", "B", "C", "D", "E", "F", "archived"].map((name) => `${spaceId}-${name}`);
const early = new Date("2020-01-01T00:00:00Z");
const later = new Date("2020-02-01T00:00:00Z");
const recent = new Date("2020-03-01T00:00:00Z");
const rotationUrl = "http://localhost/api/prayer-tracker/rotation";
let prisma: PrismaClient;

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: async () => ({ userId, errorResponse: null }),
}));
vi.mock("@/lib/prisma", () => ({
  get default() {
    return prisma;
  },
}));

type FixtureFamily = { id: string } & Pick<
  Prisma.prayerFamilyCreateManyInput,
  "lastPrayedAt" | "lastPrayedByMemberId" | "archivedAt" | "createdAt"
>;

async function seedFamilies(...families: FixtureFamily[]) {
  await prisma.prayerFamily.createMany({
    data: families.map((family) => ({
      spaceId,
      familyName: family.id,
      parents: "",
      children: [],
      createdAt: early,
      ...family,
    })),
  });
}

async function seedMembers(firstCapacity: number, secondCapacity: number) {
  await prisma.prayerMember.createMany({
    data: [
      { spaceId, id: member1, displayName: "Member 1", assignmentCapacity: firstCapacity, appwriteUserId: userId, joinedAt: early },
      { spaceId, id: member2, displayName: "Member 2", assignmentCapacity: secondCapacity, joinedAt: early },
    ],
  });
}

async function generate() {
  const response = await GET(new Request(rotationUrl));
  expect(response.status).toBe(200);
  return await response.json() as {
    families: Array<{ id: string; lastPrayedAt: string | null; lastPrayedByMemberId: string | null }>;
    assignments: Record<string, string>;
    flowId: string;
  };
}

describe.skipIf(!databaseUrl)("prayer rotation endpoints", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await prisma.prayerFamilySpace.create({
      data: { id: spaceId, spaceName: "Rotation test", shareCode: spaceId, createdByUserId: userId },
    });
  });

  afterEach(async () => {
    await prisma.prayerFamily.deleteMany({ where: { spaceId } });
    await prisma.prayerMember.deleteMany({ where: { spaceId } });
  });

  afterAll(async () => {
    await prisma.prayerFamilySpace.deleteMany({ where: { id: spaceId } });
    await prisma.$disconnect();
    await pool.end();
  });

  it("alternates all four assignments across two members with two slots each", async () => {
    await seedMembers(2, 2);
    await seedFamilies(
      { id: a, lastPrayedAt: early, lastPrayedByMemberId: member1 },
      { id: b, lastPrayedAt: early, lastPrayedByMemberId: member1 },
      { id: c, lastPrayedAt: later, lastPrayedByMemberId: member2 },
      { id: d, lastPrayedAt: later, lastPrayedByMemberId: member2 },
    );
    expect((await generate()).assignments).toEqual({ [a]: member2, [b]: member2, [c]: member1, [d]: member1 });
  });

  it("selects five families and alternates all five with capacities of two, two and one", async () => {
    await seedMembers(2, 2);
    await prisma.prayerMember.create({
      data: { spaceId, id: member3, displayName: "Member 3", assignmentCapacity: 1, joinedAt: early },
    });
    await seedFamilies(
      { id: a, lastPrayedAt: early, lastPrayedByMemberId: member1 },
      { id: b, lastPrayedAt: early, lastPrayedByMemberId: member1 },
      { id: c, lastPrayedAt: early, lastPrayedByMemberId: member2 },
      { id: d, lastPrayedAt: early, lastPrayedByMemberId: member2 },
      { id: e, lastPrayedAt: early, lastPrayedByMemberId: member3 },
      { id: f, lastPrayedAt: recent },
    );
    const { families, assignments } = await generate();
    expect(families.map(({ id }) => id)).toEqual([a, b, c, d, e]);
    expect(Object.values(assignments).sort()).toEqual([member1, member1, member2, member2, member3]);
    for (const family of families) {
      expect(assignments[family.id]).not.toBe(family.lastPrayedByMemberId);
    }
  });

  it("assigns both available families to the alternate when a two-member rotation has spare capacity", async () => {
    await seedMembers(2, 2);
    await seedFamilies(
      { id: a, lastPrayedAt: early, lastPrayedByMemberId: member1 },
      { id: b, lastPrayedAt: later, lastPrayedByMemberId: member1 },
    );
    expect((await generate()).assignments).toEqual({ [a]: member2, [b]: member2 });
  });

  it("selects active families by prayer date, then creation date and ID, before minimizing necessary repeats", async () => {
    await seedMembers(2, 1);
    await seedFamilies(
      { id: archived, archivedAt: recent },
      { id: e, lastPrayedAt: recent, lastPrayedByMemberId: member2 },
      { id: c, lastPrayedAt: early, createdAt: later, lastPrayedByMemberId: member1 },
      { id: b, lastPrayedAt: early, createdAt: later, lastPrayedByMemberId: member1 },
      { id: d, lastPrayedAt: early, createdAt: early, lastPrayedByMemberId: member1 },
      { id: a, createdAt: recent },
    );
    const first = await generate();
    expect(first.families.map(({ id }) => id)).toEqual([a, d, b]);
    // Both D and B need Member 2 to alternate, and that member has just one slot.
    expect(first.assignments[a]).toBe(member1);
    expect([first.assignments[d], first.assignments[b]].sort()).toEqual([member1, member2]);
    expect(await generate()).toEqual(first);
  });

  it("reserves the only alternate for a family with history even when a never-prayed family comes first", async () => {
    await seedMembers(1, 1);
    await seedFamilies({ id: a }, { id: b, lastPrayedAt: early, lastPrayedByMemberId: member2 });
    expect((await generate()).assignments).toEqual({ [a]: member2, [b]: member1 });
  });

  it("assigns the oldest family within capacity and skips excess families even when repeating is necessary", async () => {
    await seedMembers(1, 0);
    await seedFamilies(
      { id: a, lastPrayedAt: early, lastPrayedByMemberId: member1 },
      { id: b, lastPrayedAt: later, lastPrayedByMemberId: member2 },
    );
    expect((await generate()).assignments).toEqual({ [a]: member1, [b]: "skip" });

    await prisma.prayerMember.update({ where: { id: member1 }, data: { assignmentCapacity: 0 } });
    expect((await generate()).assignments).toEqual({ [a]: "skip", [b]: "skip" });
  });

  it("counts one shown rotation, one confirmation and explicit answers independently of retries", async () => {
    await seedMembers(1, 1);
    const request = await prisma.prayerPersonalRequest.create({
      data: { spaceId, requestText: "Fixture", dateUpdated: early },
    });
    const { flowId } = await generate();
    // Capture the IDs allocated for fixture actions to isolate their receipts
    // from other test suites sharing this database.
    const ids = vi.spyOn(crypto, "randomUUID");
    const flowIds = () => [flowId, ...ids.mock.results.map(result => result.value as string)];
    const receipts = () => prisma.analyticsEngagementEvent.findMany({
      where: { feature: "prayer", flowId: { in: flowIds() } },
      orderBy: { step: "asc" }, select: { step: true },
    }).then(rows => rows.map(row => row.step));
    const patch = (body: object) => updateRequest(new Request(rotationUrl, {
      method: "PATCH", body: JSON.stringify({ isHouseholdRequest: true, ...body }),
    }), { params: Promise.resolve({ requestId: request.id }) });
    const confirm = (personalIds: string[]) => POST(new Request(rotationUrl, {
      method: "POST", body: JSON.stringify({ personalIds, flowId }),
    }));
    try {
      expect((await generate()).flowId).toBe(flowId);
      expect(await receipts()).toEqual([]);
      for (let replay = 0; replay < 2; replay++) {
        const shown = await observe(new Request("http://localhost/api/web/engagement", {
          method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" },
          body: JSON.stringify({ feature: "prayer", step: "rotation_shown", flowId }),
        }));
        expect(shown.status).toBe(204);
      }
      expect((await confirm(["missing-request"])).status).toBe(404);
      expect(await receipts()).toEqual(["rotation_shown"]);

      // An ordinary save with an active status never marks a request answered.
      expect((await patch({ status: "ACTIVE" })).status).toBe(200);
      expect(await receipts()).toEqual(["rotation_shown"]);
      for (let replay = 0; replay < 2; replay++) {
        expect((await confirm([request.id])).status).toBe(200);
      }
      expect(await receipts()).toEqual(["rotation_confirmed", "rotation_shown"]);
      const simultaneous = await Promise.all([patch({ markAnswered: true }), patch({ markAnswered: true })]);
      expect(simultaneous.map(response => response.status)).toEqual([200, 200]);
      expect((await patch({ markAnswered: true })).status).toBe(200);
      expect(await receipts()).toEqual(["request_answered", "rotation_confirmed", "rotation_shown"]);
      expect((await patch({ status: "ACTIVE" })).status).toBe(200);
      expect((await patch({ markAnswered: true })).status).toBe(200);
      expect(await receipts()).toEqual(["request_answered", "request_answered", "rotation_confirmed", "rotation_shown"]);
    } finally {
      await prisma.analyticsEngagementEvent.deleteMany({ where: { flowId: { in: flowIds() } } });
      ids.mockRestore();
      await prisma.prayerPersonalRequest.delete({ where: { id: request.id } });
      await prisma.userProfile.deleteMany({ where: { appwriteUserId: userId } });
    }
  });

  it("uses the confirmed override and leaves skipped families in place for the next rotation", async () => {
    await seedMembers(2, 2);
    await seedFamilies(
      { id: a },
      { id: b, lastPrayedAt: early, lastPrayedByMemberId: member1 },
      { id: c, lastPrayedAt: later },
      { id: d, lastPrayedAt: later },
      { id: e, lastPrayedAt: recent },
    );
    const first = await generate();
    expect(first.families.map(({ id }) => id)).toEqual([a, b, c, d]);

    const override = first.assignments[a] === member1 ? member2 : member1;
    const confirmation = await POST(new Request(`${rotationUrl}/confirm`, {
      method: "POST",
      body: JSON.stringify({
        familyAssignments: [
          { familyId: a, prayedByMemberId: override },
          { familyId: d, prayedByMemberId: first.assignments[d] },
        ],
      }),
    }));
    expect(confirmation.status).toBe(200);

    const next = await generate();
    expect(next.families.map(({ id }) => id)).toEqual([b, c, e, a]);
    const skipped = next.families[0];
    expect(skipped).toMatchObject({ lastPrayedAt: early.toISOString(), lastPrayedByMemberId: member1 });
    const confirmed = next.families[3];
    expect(confirmed.lastPrayedByMemberId).toBe(override);
    expect(Date.parse(confirmed.lastPrayedAt ?? "")).toBeGreaterThan(recent.getTime());
    expect(next.assignments[a]).toBe(first.assignments[a]);
  });
});
