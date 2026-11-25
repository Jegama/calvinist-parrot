import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getFeatureReport } from "@/lib/analytics/features";
import { GET as readSavedChurch } from "@/app/api/churches/[id]/route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;
let client: PrismaClient;
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ get default() { return client; } }));

describe.skipIf(!databaseUrl)("evaluation costs in the admin feature report", () => {
  const window = { start: new Date("2043-01-01T06:00:00Z"), end: new Date("2043-01-08T06:00:00Z") };
  const churchId = randomUUID();
  const preacherId = randomUUID();
  const fingerprintId = randomUUID();
  const [church, partial, standard, high, failed, old, preview] = Array.from({ length: 7 }, () => randomUUID());
  const geminiUsd = 0.00225; // 1000 input and 100 output on Hydrogen
  const base = {
    environment: "production", outcome: "success", startedAt: window.start, durationMs: 10,
  };
  const model = {
    ...base, provider: "gemini", requestedModel: "gemini-4-hydrogen", returnedModel: "gemini-4-hydrogen-20261125",
    inputTokens: 1000, outputTokens: 100, modality: "text",
  };

  beforeAll(async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await client.church.create({ data: {
      id: churchId, website: `https://${churchId}.example`, name: "Private fixture church",
      evaluations: { create: {
        id: church, createdAt: window.start, channel: "web", usageEnvironment: "production", expectedUsageAttempts: 9,
        rawEvaluation: {}, coreOnSiteCount: 0, coreTotalCount: 0, coverageRatio: 0, status: "LIMITED_INFORMATION",
        coreTrinity: "UNKNOWN", coreGospel: "UNKNOWN", coreJustificationByFaith: "UNKNOWN",
        coreChristDeityHumanity: "UNKNOWN", coreScriptureAuthority: "UNKNOWN", coreIncarnationVirginBirth: "UNKNOWN",
        coreAtonementNecessary: "UNKNOWN", coreResurrectionOfJesus: "UNKNOWN", coreReturnAndJudgment: "UNKNOWN",
        coreCharacterOfGod: "UNKNOWN",
      } },
    } });
    const churchModel = { ...model, feature: "church", operationId: church, channel: "web" };
    const tavily = { ...base, feature: "church", operationId: church, channel: "web", billingUnit: "credit", provider: "tavily" };
    await client.providerCallAttempt.createMany({ data: [
      ...["basic_fields", "core_doctrines", "secondary_doctrines", "tertiary_doctrines", "denomination_confession", "red_flags"]
        .map(stage => ({ ...churchModel, attemptId: randomUUID(), stage })),
      ...([{ stage: "crawl", quantity: 3 }, { stage: "root_extract", quantity: 1 }, { stage: "enrichment", quantity: 1 }])
        .map(receipt => ({ ...tavily, ...receipt, attemptId: randomUUID() })),
      { ...churchModel, operationId: partial, channel: "public_api", stage: "basic_fields", attemptId: randomUUID(), outcome: "invalid_output" },
      { ...tavily, operationId: partial, channel: "public_api", stage: "geocode", provider: "geoapify", quantity: 1, attemptId: randomUUID() },
      { ...tavily, operationId: partial, channel: "public_api", stage: "root_extract", outcome: "provider_error", attemptId: randomUUID() },
    ] });

    await client.sermonPreacher.create({ data: { id: preacherId, ownerId: preacherId, displayName: "Fixture", normalizedName: "fixture" } });
    await client.sermonAudioFingerprint.create({ data: { id: fingerprintId, ownerId: preacherId, sha256: "3".repeat(64) } });
    const sermonJob = {
      preacherId, ownerId: preacherId, fingerprintId, title: "Private fixture title", preachedOn: window.start,
      preset: "STANDARD" as const, requestedRuns: 1, completedRuns: 1, completedAt: window.start, status: "COMPLETE" as const, usageEnvironment: "production",
    };
    await client.sermonEvaluation.createMany({ data: [
      { ...sermonJob, id: standard, channel: "web" },
      { ...sermonJob, id: high, preset: "HIGH_CONFIDENCE", requestedRuns: 3, completedRuns: 3, channel: "public_api" },
      { ...sermonJob, id: failed, status: "FAILED", completedRuns: 0, channel: "mcp" },
      { ...sermonJob, id: preview, usageEnvironment: "preview", channel: "web" },
      { ...sermonJob, id: old, status: "COMPLETE_WITH_WARNINGS", usageEnvironment: null, completedAt: window.end },
    ] });
    const sermon = { ...model, feature: "sermon", operationId: standard, channel: "web", preset: "STANDARD" };
    const extraction = { ...sermon, stage: "extraction", modality: "audio", audioInputTokens: 700, attemptId: randomUUID(), startedAt: new Date(+window.start - 1000) };
    // The worker delivers the billed extraction twice, then resumes from its saved output.
    for (let delivery = 0; delivery < 2; delivery++) {
      await client.providerCallAttempt.upsert({ where: { attemptId: extraction.attemptId }, create: extraction, update: { outcome: "success" } });
    }
    await client.providerCallAttempt.createMany({ data: [
      { ...sermon, stage: "scoring", modality: "audio", attemptId: randomUUID() },
      { ...sermon, stage: "summary", attemptId: randomUUID() },
      ...["extraction", "scoring", "scoring", "scoring", "scoring", "harmonization", "summary"].map((stage, index) => ({
        ...sermon, operationId: high, channel: "public_api", preset: "HIGH_CONFIDENCE", stage, attemptId: randomUUID(),
        modality: index < 5 ? "audio" : "text", outcome: index === 1 || stage === "harmonization" ? "invalid_output" : "success",
      })),
      { ...sermon, operationId: failed, channel: "mcp", stage: "extraction", modality: "audio", outcome: "provider_error", attemptId: randomUUID() },
      { ...sermon, operationId: preview, environment: "preview", stage: "extraction", attemptId: randomUUID() },
    ] });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await client.providerCallAttempt.deleteMany({ where: { operationId: { in: [church, partial, standard, high, failed, preview] } } });
    await client.church.deleteMany({ where: { id: churchId } });
    await client.sermonEvaluation.deleteMany({ where: { preacherId } });
    await client.sermonAudioFingerprint.deleteMany({ where: { id: fingerprintId } });
    await client.sermonPreacher.deleteMany({ where: { id: preacherId } });
    await client.$disconnect();
  });

  it("uses only preview evaluation receipts and completions in a preview snapshot", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      const report = await getFeatureReport(window);
      const combined = report.evaluationChannels!.find(row => row.feature === "sermon" && row.channel === "combined");
      expect(combined).toMatchObject({ completions: 1, estimatedSpendUsd: geminiUsd, costPerCompletionUsd: null });
      expect(report.evaluationStages).toHaveLength(1);
      expect(report.evaluationStages![0]).toMatchObject({ feature: "sermon", stage: "extraction", attempts: 1 });
    } finally {
      vi.stubEnv("VERCEL_ENV", "production");
    }
  });

  it("reconciles the model and fee breakdown and keeps a saved MCP detail read free", async () => {
    const before = await getFeatureReport(window);
    // Simulate a future MCP adapter reading the same saved detail as the website.
    const response = await readSavedChurch(new Request("http://local.test/church-detail"), { params: Promise.resolve({ id: churchId }) });
    expect(response.status).toBe(200);
    expect((await response.json()).evaluation.id).toBe(church);
    const report = await getFeatureReport(window);
    expect(report.evaluationChannels).toEqual(before.evaluationChannels);
    const channels = report.evaluationChannels!.filter(row => row.feature === "church");
    const web = channels.find(row => row.channel === "web")!;
    expect(web.completions).toBe(1);
    expect(web.modelSpend).toBeCloseTo(6 * geminiUsd, 8);
    expect(web.externalFees).toBeCloseTo(0.04, 8);
    expect(web.costPerCompletionUsd).toBeCloseTo(0.04 + 6 * geminiUsd, 8);
    expect(web.spendCoverage).toContain("9/9 priced");
    const api = channels.find(row => row.channel === "public_api")!;
    expect(api.spendCoverage).toMatch(/Partial coverage.*2\/3 attempts measured, 1\/3 priced/);
    expect(api.externalFees).toBeNull();
    expect(api.estimatedSpendUsd).toBeCloseTo(geminiUsd, 8);
    expect(channels.find(row => row.channel === "mcp")).toMatchObject({ completions: 0, estimatedSpendUsd: 0, costPerCompletionUsd: null });
    expect(report.rows.find(row => row.key === "church")!.estimatedSpendUsd).toBeCloseTo(7 * geminiUsd + 0.04, 8);
    expect(report.evaluationStages).toContainEqual(expect.objectContaining({ feature: "church", stage: "crawl", provider: "tavily", billingUnit: "credit", quantity: 3, spend: 0.024 }));
    expect(report.evaluationStages).toContainEqual(expect.objectContaining({ feature: "church", stage: "geocode", measured: 1, priced: 0, spend: null }));
    expect(JSON.stringify(report)).not.toContain(churchId);
  });

  it("prices a completed church evaluation when its last receipt arrives in a later period", async () => {
    const lateAttempt = randomUUID();
    // A geocode was scheduled but its receipt has not arrived. Known charges still contribute.
    await client.churchEvaluation.update({ where: { id: church }, data: { expectedUsageAttempts: 10 } });
    try {
      const report = await getFeatureReport(window);
      const row = report.evaluationChannels!.find(item => item.feature === "church" && item.channel === "web")!;
      expect(row.estimatedSpendUsd).toBeCloseTo(0.04 + 6 * geminiUsd, 8);
      expect(row.costPerCompletionUsd).toBeNull();
      expect(row.spendCoverage).toMatch(/Partial coverage.*0\/1 completions fully priced/);

      // Stand in for a plan-priced geocoder with a known credit rate to verify both dollar totals.
      await client.providerCallAttempt.create({ data: {
        ...base, attemptId: lateAttempt, operationId: church, feature: "church", channel: "web",
        stage: "geocode", provider: "tavily", billingUnit: "credit", quantity: 2, startedAt: window.end,
      } });
      const completed = await getFeatureReport(window);
      const completedRow = completed.evaluationChannels!.find(item => item.feature === "church" && item.channel === "web")!;
      expect(completedRow.estimatedSpendUsd).toBeCloseTo(0.04 + 6 * geminiUsd, 8);
      expect(completedRow.costPerCompletionUsd).toBeCloseTo(0.04 + 6 * geminiUsd + 0.016, 8);
      expect(completedRow.spendCoverage).toContain("1/1 completions fully priced");
      const next = await getFeatureReport({ start: window.end, end: new Date(+window.end + 86_400_000) });
      expect(next.evaluationChannels!.find(item => item.feature === "church" && item.channel === "web"))
        .toMatchObject({ completions: 0, estimatedSpendUsd: 0.016, externalFees: 0.016, costPerCompletionUsd: null });
    } finally {
      await client.providerCallAttempt.deleteMany({ where: { attemptId: lateAttempt } });
      await client.churchEvaluation.update({ where: { id: church }, data: { expectedUsageAttempts: 9 } });
    }
  });

  it("uses the completion cohort for both sermon presets and retains spend on failed, retried and resumed work", async () => {
    const report = await getFeatureReport(window);
    const row = report.rows.find(item => item.key === "sermon")!;
    expect(row.actions).toContainEqual({ label: "Evaluations completed", count: 2 });
    expect(row.estimatedSpendUsd).toBeCloseTo(10 * geminiUsd, 8);
    expect(row.costPerCompletionUsd).toBeCloseTo((3 + 7) * geminiUsd / 2, 8);
    expect(row.spendCoverage).toContain("2/2 completions fully priced");
    const channels = report.evaluationChannels!.filter(item => item.feature === "sermon");
    expect(channels.find(item => item.channel === "web")!.estimatedSpendUsd).toBeCloseTo(2 * geminiUsd, 8);
    expect(channels.find(item => item.channel === "web")!.costPerCompletionUsd).toBeCloseTo(3 * geminiUsd, 8);
    expect(channels.find(item => item.channel === "mcp")).toMatchObject({ completions: 0, estimatedSpendUsd: geminiUsd, costPerCompletionUsd: null });
    expect(report.evaluationStages).toContainEqual(expect.objectContaining({ feature: "sermon", stage: "scoring", preset: "HIGH_CONFIDENCE", modality: "audio", attempts: 4, priced: 4 }));
    const next = await getFeatureReport({ start: window.end, end: new Date(+window.end + 10000) });
    expect(next.evaluationChannels!.find(item => item.feature === "sermon" && item.channel === "unknown"))
      .toMatchObject({ completions: 1, estimatedSpendUsd: null, costPerCompletionUsd: null, spendCoverage: expect.stringContaining("0/1 completions fully priced") });
    expect(JSON.stringify(report)).not.toMatch(/Private fixture|example|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-/i);
  });
});
