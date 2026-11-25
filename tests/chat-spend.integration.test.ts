import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getFeatureReport } from "@/lib/analytics/features";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;
let db: PrismaClient;
vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));

describe.skipIf(!databaseUrl)("Chat cost by submission cohort", () => {
  const start = new Date("2043-05-02T05:00:00Z");
  const end = new Date("2043-05-03T05:00:00Z");
  const before = new Date(+start - 1000);
  const after = new Date(+end + 1000);
  const ids = Array.from({ length: 8 }, () => randomUUID());
  const [web, api, mcp, guestRetry, unfinished, earlier, shared, interrupted] = ids;
  const chatId = randomUUID();
  const turns = [
    { id: web, channel: "web", reply: true }, { id: api, channel: "public_api", reply: true },
    { id: mcp, channel: "mcp", reply: true }, { id: guestRetry, channel: "web", reply: true },
    { id: unfinished, channel: "unknown", reply: false }, { id: earlier, channel: "web", reply: true },
  ];
  const events = turns.flatMap(({ id, channel, reply }) => (reply ? ["submission", "reply"] : ["submission"]).map(kind => ({
    operationId: id, kind, channel, actorKind: channel === "web" ? "guest" : "integration", chatId,
    occurredAt: id === earlier ? before : kind === "reply" && id === web ? after : start,
  })));
  const receipt = (operationId: string, stage = "agent", isRetry = false, startedAt = start) => ({
    operationId, stage, attemptId: randomUUID(), isRetry, startedAt, feature: "chat", requestedModel: "claude-haiku-5-5",
    returnedModel: "claude-haiku-5-5", provider: "anthropic", outcome: "success", environment: "production",
    inputTokens: 1000, outputTokens: 100, durationMs: 250,
  });
  const attempts = [
    receipt(web), receipt(web), { ...receipt(web), outcome: "provider_error" }, receipt(web, "agent", true),
    receipt(web, "title"), receipt(web, "memory", false, after), receipt(web, "ccel_embedding"),
    receipt(api), receipt(mcp), receipt(guestRetry), { ...receipt(unfinished), outcome: "provider_error" },
    receipt(earlier, "memory"), receipt(shared, "ccel_embedding"), { ...receipt(web), environment: "preview" },
  ];
  const unit = 0.00015;

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "");
    vi.stubEnv("VERCEL_TOKEN", "");
    await db.chatAnalyticsEvent.createMany({ data: events });
    await db.providerCallAttempt.createMany({ data: attempts });
  });
  afterAll(async () => {
    await db.chatAnalyticsEvent.deleteMany({ where: { chatId } });
    await db.providerCallAttempt.deleteMany({ where: { operationId: { in: ids } } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  });

  it("reconciles the Chat row with paid failures, tool calls, retries and delayed work, including replay", async () => {
    const report = await getFeatureReport({ start, end });
    const details = report.chatSpend!;
    const row = report.rows.find(r => r.key === "chat")!;
    expect(row.actions).toContainEqual({ label: "Completed turns", count: 4 });
    expect(row.estimatedSpendUsd).toBeCloseTo(11 * unit, 9);
    expect(row.costPerCompletionUsd).toBeCloseTo(11 * unit / 4, 9);
    const [combined, website, publicApi, mcpChannel, unknown] = details.byChannel;
    expect(combined).toMatchObject({ completions: 4, measured: 11, attempts: 11, priced: 11, partial: false });
    expect(combined.retrySpendUsd).toBeCloseTo(unit, 9);
    expect(website.costPerCompletionUsd).toBeCloseTo(8 * unit / 2, 9);
    expect(publicApi.costPerCompletionUsd).toBeCloseTo(unit, 9);
    expect(mcpChannel.costPerCompletionUsd).toBeCloseTo(unit, 9);
    expect(unknown).toMatchObject({ completions: 0, attempts: 1, costPerCompletionUsd: null });
    expect(unknown.estimatedSpendUsd).toBeCloseTo(unit, 9);
    expect(details.unattributed).toMatchObject({ attempts: 1, completions: 0, costPerCompletionUsd: null });
    expect(details.unattributed.estimatedSpendUsd).toBeCloseTo(unit, 9);
    expect(details.stages.find(s => !s.unattributed && s.stage === "agent")).toMatchObject({
      model: "claude-haiku-5-5", attempts: 8, inputTokens: 8000, outputTokens: 800,
    });
    expect(details.stages.find(s => s.stage === "memory")?.attempts).toBe(1);
    expect(JSON.stringify(details)).not.toContain(web);
    expect(JSON.stringify(details)).not.toContain(chatId);
    await db.chatAnalyticsEvent.createMany({ data: events, skipDuplicates: true });
    await db.providerCallAttempt.createMany({ data: attempts, skipDuplicates: true });
    expect((await getFeatureReport({ start, end })).chatSpend).toEqual(details);
  });

  it("keeps costs separate from completions when attempts lack counters or receipts", async () => {
    await db.chatAnalyticsEvent.createMany({ data: ["submission", "reply"].map(kind => ({
      chatId, operationId: interrupted, channel: "mcp", actorKind: "integration", kind, occurredAt: end,
    })) });
    const nextDay = { start: end, end: new Date(+end + 86400000) };
    let report = await getFeatureReport(nextDay);
    expect(report.chatSpend?.byChannel[0]).toMatchObject({
      completions: 1, attempts: 0, recordedCompletions: 0, estimatedSpendUsd: null, costPerCompletionUsd: null, partial: true,
    });
    await db.providerCallAttempt.create({ data: {
      ...receipt(interrupted), startedAt: end, inputTokens: null, outputTokens: null, outcome: "provider_error",
    } });
    report = await getFeatureReport(nextDay);
    expect(report.chatSpend?.byChannel[0]).toMatchObject({
      completions: 1, attempts: 1, measured: 0, priced: 0, estimatedSpendUsd: null, costPerCompletionUsd: null, partial: true,
    });
    const historical = await getFeatureReport({ start: new Date("2000-01-01"), end: new Date("2000-01-08") });
    expect(historical.chatSpend?.byChannel[0]).toMatchObject({ estimatedSpendUsd: null, costPerCompletionUsd: null, partial: true });
  });
});
