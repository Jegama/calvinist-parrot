import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { describe, expect, it, vi } from "vitest";

import { GET as getChurch } from "@/app/api/v1/churches/[id]/route";
import { POST as observe } from "@/app/api/web/engagement/route";
import { getEngagementReport } from "@/lib/analytics/engagement";
import { retrievePublicChurch } from "@/lib/api/handlers/church";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

let fixture: Prisma.TransactionClient;
vi.mock("@/lib/prisma", () => ({ get default() { return fixture; } }));

describe.skipIf(!databaseUrl)("Church Finder engagement by entry channel", () => {
  it("reconciles two results views, one detail open and one saved retrieval per external channel after replay", async () => {
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const finished = new Error("Roll back synthetic church and receipts");
    try {
      await expect(db.$transaction(async tx => {
        fixture = tx;
        const church = await tx.church.create({ data: {
          name: "Synthetic", website: `https://${randomUUID()}.example`, denominationSignals: [],
        } });
        const flows = [randomUUID(), randomUUID()];
        const operationId = randomUUID();
        const start = new Date(Date.now() - 60_000);
        const end = new Date(Date.now() + 60_000);
        const before = (await getEngagementReport({ start, end }, tx)).church!;
        const url = `https://fixture.example/api/v1/churches/${church.id}`;
        const request = new Request(url, { headers: { "Idempotency-Key": operationId } });
        async function website(step: string, flowId: string) {
          const response = await observe(new Request("https://fixture.example/api/web/engagement", {
            method: "POST", headers: { Origin: "https://fixture.example", "Content-Type": "application/json" },
            body: JSON.stringify({ feature: "church", step, flowId }),
          }));
          expect(response.status).toBe(204);
        }
        expect((await getChurch(new Request(url), { params: Promise.resolve({ id: church.id }) })).status).toBe(400);
        expect((await retrievePublicChurch(church.id, "mcp", null)).status).toBe(400);
        for (let replay = 0; replay < 2; replay++) {
          await website("results_viewed", flows[0]);
          await website("results_viewed", flows[1]);
          await website("detail_opened", flows[0]);
          expect((await getChurch(request, { params: Promise.resolve({ id: church.id }) })).status).toBe(200);
          expect((await retrievePublicChurch(church.id, "mcp", operationId)).status).toBe(200);
        }
        const after = (await getEngagementReport({ start, end }, tx)).church!;
        expect(before.steps.every(step => step.count !== null)).toBe(true);
        expect(before.external![0].count).not.toBeNull();
        expect(after.steps.map((step, i) => step.count! - before.steps[i].count!)).toEqual([2, 1]);
        expect(after.steps[1].denominator! - before.steps[1].denominator!).toBe(2);
        expect(after.external!.map((outcome, i) => outcome.count! - (before.external![i].count ?? 0))).toEqual([1, 1]);
        throw finished;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })).rejects.toBe(finished);
    } finally {
      await db.$disconnect();
    }
  });
});
