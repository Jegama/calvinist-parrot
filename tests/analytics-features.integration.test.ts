import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getFeatureReport } from "@/lib/analytics/features";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;
let client: PrismaClient;
vi.mock("@/lib/prisma", () => ({ get default() { return client; } }));

describe.skipIf(!databaseUrl)("feature report with provider attempts and a Vercel outage", () => {
  const start = new Date("2042-01-01T06:00:00Z");
  const end = new Date("2042-01-08T06:00:00Z");
  const before = new Date(+start - 1000);
  const operation = randomUUID();
  const devotional = randomUUID();
  const devotionalOperation = createHash("sha256").update(devotional).digest("hex");
  const operationIds = [operation, devotionalOperation, randomUUID()];
  const entryIds = [operation, randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const heritageRevision = randomUUID();
  beforeAll(async () => {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "synthetic");
    vi.stubEnv("VERCEL_PROJECT_ID", "project");
    vi.stubEnv("VERCEL_TEAM_ID", "team");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const base = {
      operationId: operation, feature: "personal_journal", provider: "anthropic",
      requestedModel: "claude-haiku-5-5", startedAt: start, completedAt: start,
      environment: "production", inputTokens: 1000, outputTokens: 100, durationMs: 200, outcome: "success",
    };
    await client.providerCallAttempt.createMany({ data: [
      ...["call1a", "call1b", "call1c", "call2"].map(stage => ({ ...base, stage, attemptId: randomUUID() })),
      { ...base, attemptId: randomUUID(), stage: "call1b", startedAt: before, outcome: "invalid_output" },
      { ...base, attemptId: randomUUID(), stage: "call2", startedAt: end, completedAt: end },
      { ...base, attemptId: randomUUID(), stage: "call2", environment: "preview" },
      { ...base, attemptId: randomUUID(), feature: "heritage_journal", operationId: operationIds[2], stage: "call1",
        outputTokens: null, completedAt: null, outcome: "provider_error" },
      { ...base, attemptId: randomUUID(), feature: "daily_devotional", provider: "gemini",
        requestedModel: "gemini-4-hydrogen", operationId: devotionalOperation, stage: "generation" },
    ] });
    await client.parrotDevotionals.create({ data: {
      devotional_id: devotional, title: "fixture", bible_verse: "fixture", devotional_text: "fixture", createdAt: start,
    } });
  });
  afterAll(async () => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
    await client.$executeRaw`DELETE FROM "AnalyticsJournalCompletion" WHERE "operationId" = ANY(${[...entryIds, heritageRevision]}::text[])`;
    await client.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
    await client.providerCallAttempt.deleteMany({ where: { operationId: { in: operationIds } } });
    await client.parrotDevotionals.deleteMany({ where: { devotional_id: devotional } });
    await client.$disconnect();
  });

  it("preserves actions and costs when Vercel fails, dates retries to the proper cohort and isolates partial coverage", async () => {
    const report = await getFeatureReport({ start, end });
    expect(report.pageviewCoverage).toContain("unavailable");
    expect(report.rows.every(row => row.pageviews === null)).toBe(true);
    const personal = report.rows.find(row => row.key === "personal_journal")!;
    // Four successful attempts in the window plus one billed, invalid-output attempt before it.
    expect(personal.actions).toContainEqual({ label: "AI reflections completed", count: 1 });
    expect(personal.estimatedSpendUsd).toBeCloseTo(0.00060, 8);
    expect(personal.costPerCompletionUsd).toBeCloseTo(0.00075, 8);
    const heritage = report.rows.find(row => row.key === "heritage_journal")!;
    expect(heritage.spendCoverage).toMatch(/Partial coverage.*0\/1 attempts measured/);
    expect(heritage.estimatedSpendUsd).toBeNull();
    expect(heritage.costPerCompletionUsd).toBeNull();
    const daily = report.rows.find(row => row.key === "daily_devotional")!;
    expect(daily.actions).toContainEqual({ label: "Devotionals published", count: 1 });
    expect(daily.costPerCompletionUsd).toBeCloseTo(0.00225, 8);
    expect(report.rows.find(row => row.key === "church")?.estimatedSpendUsd).toBe(0);
    expect(JSON.stringify(report)).not.toContain(operation);
  });

  it("counts durable journal completions even without provider receipts and excludes partial outputs", async () => {
    const [priced, personal, heritage, partialPersonal, partialHeritage] = entryIds;
    const authorProfileId = randomUUID();
    // Only the priced entry also has a #96 provider completion marker.
    await client.journalEntry.createMany({ data: entryIds.map(id => ({
      id, authorProfileId, entryText: "synthetic", tags: [],
      entryType: id === heritage || id === partialHeritage ? "DISCIPLESHIP" as const : "PERSONAL" as const,
      heritageOperationId: id === heritage ? heritageRevision : null,
    })) });
    for (const entryId of [priced, personal, partialPersonal]) {
      await client.journalEntryAI.create({ data: {
        entryId, call1: {}, call2: {}, modelInfo: { status: entryId === partialPersonal ? "partial" : "complete" },
      } });
    }
    // Initial and edited Heritage revisions checkpoint Call 1 without completing.
    for (const entryId of [heritage, partialHeritage]) {
      await client.journalEntryAI.create({ data: { entryId, call1: {}, modelInfo: { call1Model: "synthetic" } } });
    }
    await client.journalEntryAI.update({ where: { entryId: heritage }, data: {
      call2: { tags: [] }, modelInfo: { call1Model: "synthetic", call2Model: "synthetic" },
    } });
    // Re-saving an already complete reflection leaves its original receipt.
    await client.journalEntryAI.update({ where: { entryId: personal }, data: { modelInfo: { status: "complete" } } });
    // Put only the test receipts into the same synthetic period as the provider fixture.
    const receipts = await client.$queryRaw<{ operationId: string }[]>`
      UPDATE "AnalyticsJournalCompletion" SET "completedAt" = ${start}
      WHERE "operationId" = ANY(${[...entryIds, heritageRevision]}::text[]) RETURNING "operationId"
    `;
    expect(receipts.map(row => row.operationId).sort()).toEqual([priced, personal, heritageRevision].sort());

    const report = await getFeatureReport({ start, end });
    const personalRow = report.rows.find(row => row.key === "personal_journal")!;
    expect(personalRow.actions).toContainEqual({ label: "AI reflections completed", count: 2 });
    expect(personalRow.spendCoverage).toContain("1/2 completions fully priced");
    expect(personalRow.costPerCompletionUsd).toBeNull();
    const heritageRow = report.rows.find(row => row.key === "heritage_journal")!;
    expect(heritageRow.actions.find(action => action.label.includes("reflections"))?.count).toBe(1);
    expect(heritageRow.spendCoverage).toContain("0/1 completions fully priced");
    expect(heritageRow.costPerCompletionUsd).toBeNull();
    expect(report.actionCoverage).toContain("Earlier reflection counts are partial");
  });

  it("withholds spend before collection began", async () => {
    const report = await getFeatureReport({ start: new Date("2000-01-01"), end: new Date("2000-01-08") });
    const journal = report.rows.find(row => row.key === "personal_journal")!;
    expect(journal.estimatedSpendUsd).toBeNull();
    expect(journal.spendCoverage).toContain("Before observed coverage");
  });
});
