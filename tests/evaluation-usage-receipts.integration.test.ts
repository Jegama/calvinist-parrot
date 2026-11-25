import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { recordUsageAttempt, startUsageAttempt } from "@/lib/provider-usage";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;
let client: PrismaClient;
vi.mock("@/lib/prisma", () => ({ get default() { return client; } }));

describe.skipIf(!databaseUrl)("evaluation receipt delivery and dated pricing", () => {
  const context = { feature: "church", stage: "basic_fields", channel: "web", operationId: randomUUID() } as const;
  const spec = { provider: "gemini", model: "gemini-4-hydrogen" } as const;
  const counters = { promptTokenCount: 150000, cachedContentTokenCount: 35000, candidatesTokenCount: 200 };

  beforeAll(() => { client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }); });
  afterAll(async () => {
    await client.providerCallAttempt.deleteMany({ where: { operationId: context.operationId } });
    await client.$disconnect();
  });

  it("preserves the final receipt after replays and applies the verified cache and context rate on its effective day", async () => {
    const prior = { ...startUsageAttempt(context, spec), startedAt: new Date("2026-11-20T23:59:59Z") };
    const current = { ...startUsageAttempt(context, spec), startedAt: new Date("2026-11-21T00:00:00Z") };
    await recordUsageAttempt(prior, "success", 100, spec.model, counters);
    await Promise.all([
      recordUsageAttempt(current, "started", 0),
      recordUsageAttempt(current, "received", 100, spec.model, counters),
    ]);
    expect(await client.providerCallAttempt.findUniqueOrThrow({ where: { attemptId: current.attemptId } }))
      .toMatchObject({ outcome: "received", inputTokens: 115000 });
    await recordUsageAttempt(current, "invalid_output", 100, spec.model, counters);
    await recordUsageAttempt(current, "started", 0);
    await recordUsageAttempt(current, "received", 100, spec.model, counters);
    const rows = await client.$queryRaw<{ outcome: string; spend: number | null }[]>`
      SELECT outcome, usd::float8 AS spend FROM analytics_priced_provider_attempt
      WHERE "operationId" = ${context.operationId} ORDER BY "startedAt"
    `;
    expect(rows).toEqual([
      { outcome: "success", spend: null },
      { outcome: "invalid_output", spend: (115000 * 1.5 + 35000 * 0.075 + 200 * 7.5) / 1000000 },
    ]);
  });
});
