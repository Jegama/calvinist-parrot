import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as createPersonal } from "@/app/api/journal/entries/route";
import { POST as retryPersonal } from "@/app/api/journal/entries/[id]/reprocess/route";
import { POST as createHeritage } from "@/app/api/kids-discipleship/logs/route";
import { POST as retryHeritage } from "@/app/api/kids-discipleship/logs/[id]/reprocess/route";
import { GET as readDevotional } from "@/app/api/devotional-generation/route";
import { getDevotionalId } from "@/utils/devotionalUtils";
import { journalResponses } from "./fixtures/journal-responses";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;
const spaceId = randomUUID();
const userId = `reader-${spaceId}`;
const memberId = `child-${spaceId}`;
const profileId = `profile-${spaceId}`;
const text = "Today I had a hard time listening patiently and I want to grow in kindness toward my family.";
const devotional = { title: "Patience", bible_verse: "James 1:19", devotional: "Be quick to listen." };
const returnedModel = "claude-haiku-5-5-test-version";
let db: PrismaClient;
let invalidStage: keyof typeof journalResponses | undefined;

vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
vi.mock("@/lib/auth", () => ({ requireAuthenticatedUser: async () => ({ userId, errorResponse: null }) }));
vi.mock("@tavily/core", () => ({ tavily: () => ({ search: async () => ({ results: [] }) }) }));

// Exercise the actual SDKs and adapters, with deterministic provider responses at the HTTP boundary.
const transport = vi.fn<typeof fetch>(async (url, init) => {
  const body = JSON.parse(String(init?.body));
  if (String(url).includes(":generateContent")) {
    expect(String(url)).toContain("gemini-4-hydrogen");
    return Response.json({
      modelVersion: "gemini-4-hydrogen",
      candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(devotional) }] } }],
      usageMetadata: { promptTokenCount: 36, candidatesTokenCount: 5, thoughtsTokenCount: 19, totalTokenCount: 60 },
    });
  }
  expect(new URL(String(url)).pathname).toBe("/v1/messages");
  expect(body.model).toBe("claude-haiku-5-5");
  const properties = body.output_config.format.schema.properties;
  const responseKeys: Array<keyof typeof journalResponses> =
    ["summary", "title", "heartReflection", "scripture", "suggestedPrayerRequests", "suggestedChildPrayerRequests"];
  const key = responseKeys.find((field) => Object.hasOwn(properties, field));
  if (!key) throw new Error("Unrecognized journal schema");
  const response = key === invalidStage ? "{" : JSON.stringify(journalResponses[key]);
  return Response.json({
    model: returnedModel, content: [{ type: "text", text: response }],
    usage: { input_tokens: 15, output_tokens: 4, output_tokens_details: { thinking_tokens: 2 } },
  });
});

const features = [
  { feature: "personal_journal", create: createPersonal, retry: retryPersonal, failing: "heartReflection", stage: "call1b",
    stages: ["call1a", "call1b", "call1c", "call2"] },
  { feature: "heritage_journal", create: createHeritage, retry: retryHeritage, failing: "suggestedChildPrayerRequests", stage: "call2",
    stages: ["call1", "call2"] },
] as const;

function request() {
  return new Request("http://localhost/api", { method: "POST",
    body: JSON.stringify({ entryText: text, memberId, category: "NURTURE" }) });
}

async function readEvents(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("ndjson");
  return (await response.text()).trim().split("\n").map(line => JSON.parse(line));
}

describe.skipIf(!databaseUrl)("structured generation through the HTTP handlers and PostgreSQL", () => {
  let pool: Pool;
  const operationIds: string[] = [];
  let savedDevotionalId: string | undefined;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    await db.userProfile.create({ data: { id: profileId, appwriteUserId: userId, displayName: "Synthetic reader" } });
    await db.prayerFamilySpace.create({ data: { id: spaceId, spaceName: "Synthetic household", shareCode: spaceId, createdByUserId: userId } });
    await db.prayerMember.createMany({ data: [
      { spaceId, displayName: "Adult", appwriteUserId: userId },
      { spaceId, displayName: "Child", id: memberId, isChild: true, birthdate: new Date("2019-01-02") },
    ] });
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", transport);
  });

  afterAll(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await db.providerCallAttempt.deleteMany({ where: { operationId: { in: operationIds } } });
    if (savedDevotionalId) await db.parrotDevotionals.deleteMany({ where: { devotional_id: savedDevotionalId } });
    await db.journalEntry.deleteMany({ where: { authorProfileId: profileId } });
    await db.prayerMember.deleteMany({ where: { spaceId } });
    await db.prayerFamilySpace.deleteMany({ where: { id: spaceId } });
    await db.userProfile.deleteMany({ where: { appwriteUserId: userId } });
    await db.$disconnect();
    await pool.end();
  });

  it.each(features)("creates a complete $feature entry with one measured call per stage", async ({ feature, create, retry, stages }) => {
    invalidStage = undefined;
    const events = await readEvents(await create(request()));
    const operationId: string = events[0].entry.id;
    operationIds.push(operationId);
    expect(events.at(-1)?.type).toBe("done");
    const rows = await db.providerCallAttempt.findMany({ where: { feature, operationId } });
    expect(rows.map(row => row.stage).sort()).toEqual([...stages].sort());
    for (const row of rows) {
      expect(row).toMatchObject({ provider: "anthropic", returnedModel, inputTokens: 15, outputTokens: 4, thinkingTokens: 2 });
      expect(row.completedAt).toBeInstanceOf(Date);
    }
    const output = await db.journalEntryAI.findUniqueOrThrow({ where: { entryId: operationId } });
    for (const stage of stages) expect(output.modelInfo).toHaveProperty(`${stage}Model`, returnedModel);
    const attempts = transport.mock.calls.length;
    expect((await retry(request(), { params: Promise.resolve({ id: operationId }) })).status).toBe(409);
    expect(transport).toHaveBeenCalledTimes(attempts);
  });

  it.each(features)("recovers $feature and counts both attempts at the failed stage", async ({ feature, create, retry, failing, stage, stages }) => {
    invalidStage = failing;
    const events = await readEvents(await create(request()));
    const operationId: string = events[0].entry.id;
    operationIds.push(operationId);
    const first = await db.providerCallAttempt.findMany({ where: { feature, operationId } });
    expect(first).toHaveLength(stages.length);
    expect(first.find(row => row.stage === stage)).toMatchObject({ inputTokens: 15, outputTokens: 4, completedAt: null });
    expect(first.every(row => !row.completedAt)).toBe(true);

    invalidStage = undefined;
    const retried = await readEvents(await retry(request(), { params: Promise.resolve({ id: operationId }) }));
    expect(retried.at(-1)?.type).toBe("done");
    const rows = await db.providerCallAttempt.findMany({ where: { feature, operationId } });
    expect(rows).toHaveLength(stages.length + 1);
    const repeated = rows.filter(row => row.stage === stage);
    expect(repeated).toHaveLength(2);
    expect(new Set(repeated.map(row => row.outcome)).size).toBe(2);
    expect(new Set(repeated.map(row => row.attemptId)).size).toBe(2);
    expect(rows.every(row => row.completedAt)).toBe(true);
  });

  it("persists Hydrogen usage once across devotional generation and a cache hit", async () => {
    const future = new Date(Date.UTC(2200 + Math.floor(Math.random() * 900), 3, 12, 15));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(future);
    const id = getDevotionalId(future);
    expect(await db.parrotDevotionals.count({ where: { devotional_id: id } })).toBe(0);
    savedDevotionalId = id;
    const before = transport.mock.calls.length;
    expect(await (await readDevotional()).json()).toEqual(devotional);
    expect(await (await readDevotional()).json()).toEqual(devotional);
    expect(transport).toHaveBeenCalledTimes(before + 1);
    const operationId = createHash("sha256").update(id).digest("hex");
    operationIds.push(operationId);
    const rows = await db.providerCallAttempt.findMany({ where: { feature: "daily_devotional", operationId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "gemini", returnedModel: "gemini-4-hydrogen", promptTokens: 36,
      candidateTokens: 5, outputTokens: 24, thinkingTokens: 19, providerTotalTokens: 60 });
    expect(rows[0].completedAt).toBeInstanceOf(Date);
  });
});
