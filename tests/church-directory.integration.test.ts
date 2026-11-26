import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { describe, expect, it, vi } from "vitest";

import { GET as listChurches } from "@/app/api/v1/churches/route";
import { GET as listWebChurches } from "@/app/api/churches/route";
import { findChurches, retrievePublicChurch } from "@/lib/api/handlers/church";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

let fixture: Prisma.TransactionClient;
const evaluateChurch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/church-evaluation/submit", () => ({ evaluateChurch }));
vi.mock("@/lib/prisma", () => ({ get default() { return fixture; } }));

describe.skipIf(!databaseUrl)("public evaluated directory", () => {
  it("paginates latest evaluations and serves saved evidence without starting paid work", async () => {
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const finished = new Error("Roll back synthetic directory and engagement events");
    try {
      await expect(db.$transaction(async tx => {
        fixture = tx;
        const denomination = randomUUID();
        async function createChurch(name: string, confessionAdopted = false) {
          return tx.church.create({ data: {
            name, website: `https://${randomUUID()}.example`, denominationLabel: denomination,
            denominationSignals: [], confessionAdopted, bestBeliefsUrl: "https://example.org/beliefs",
            addresses: { create: [{ city: "Austin", state: "TX", isPrimary: true }, { city: "Portland", state: "OR" }] },
          } });
        }

        const historic = await createChurch("Z Church", true);
        const alphabetic = await createChurch("A Church");
        const candidate = await createChurch("Saved candidate");
        const evaluation = {
          rawEvaluation: { church: { notes: [{ source_url: "https://example.org/evidence" }] } },
          badges: [], coreOnSiteCount: 10, coreTotalCount: 10, coverageRatio: 1,
          coreTrinity: "TRUE", coreGospel: "TRUE", coreJustificationByFaith: "TRUE",
          coreChristDeityHumanity: "TRUE", coreScriptureAuthority: "TRUE", coreIncarnationVirginBirth: "TRUE",
          coreAtonementNecessary: "TRUE", coreResurrectionOfJesus: "TRUE", coreReturnAndJudgment: "TRUE", coreCharacterOfGod: "TRUE",
        } satisfies Omit<Prisma.churchEvaluationCreateManyInput, "churchId" | "status">;
        const started = new Date("2026-11-01T00:00:00.000Z");
        await tx.churchEvaluation.createMany({ data: [
          { ...evaluation, churchId: historic.id, status: "RECOMMENDED", createdAt: started },
          { ...evaluation, churchId: historic.id, status: "LIMITED_INFORMATION", createdAt: new Date(+started + 86400000) },
          { ...evaluation, churchId: alphabetic.id, status: "RECOMMENDED" },
        ] });
        const evaluationCount = await tx.churchEvaluation.count();
        const paidAttempts = await tx.providerCallAttempt.count({ where: { feature: "church" } });
        const filters = { city: "austin", state: "tx", denomination: denomination.toUpperCase(), pageSize: 1 };

        const query = new URLSearchParams({ ...filters, pageSize: "1" });
        const request = new Request(`https://example.org/api/v1/churches?${query}`);
        const first = await listChurches(request);
        expect(first.status).toBe(200);
        const page = await first.json();
        expect(page).toMatchObject({ items: [{ id: historic.id, city: "Austin", state: "TX", status: "limited_information" }], page: 1, pageSize: 1, hasMore: true });
        expect(page.items).toHaveLength(1);
        expect(await findChurches({ ...filters, page: 2 })).toMatchObject({ items: [{ id: alphabetic.id }], hasMore: false });
        expect(await findChurches({ ...filters, page: 3 })).toMatchObject({ items: [], hasMore: false });
        expect((await findChurches({ ...filters, status: "recommended" })).items.map(row => row.id)).toEqual([alphabetic.id]);
        expect((await findChurches({ ...filters, state: "OR" })).items).toEqual([]);
        expect(await (await listWebChurches(request)).json()).toMatchObject({ items: [{ id: historic.id }], total: 3 });
        const detail = await retrievePublicChurch(page.items[0].id, "mcp", randomUUID());
        expect(await detail.json()).toMatchObject({
          id: historic.id, status: "limited_information", evaluationState: "evaluated",
          evaluation: { coreDoctrines: { trinity: "true" }, supportingLinks: ["https://example.org/beliefs", "https://example.org/evidence"] },
        });
        expect(await (await retrievePublicChurch(candidate.id, "mcp", randomUUID())).json()).toMatchObject({
          evaluationState: "unevaluated", evaluation: null, status: null,
        });
        expect(evaluateChurch).not.toHaveBeenCalled();
        expect(await tx.churchEvaluation.count()).toBe(evaluationCount);
        expect(await tx.providerCallAttempt.count({ where: { feature: "church" } })).toBe(paidAttempts);
        throw finished;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })).rejects.toBe(finished);
    } finally {
      await db.$disconnect();
    }
  });
});

it.each(["pageSize=26", "pageSize=0", "page=1.5", "page=1&page=2", "status=unlisted", "userId=test"])(
  "rejects invalid directory query %s before database access", async query => {
    expect((await listChurches(new Request(`https://example.org/api/v1/churches?${query}`))).status).toBe(400);
  },
);
