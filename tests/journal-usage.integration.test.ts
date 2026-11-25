import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as addPrayer } from "@/app/api/prayer-tracker/requests/route";
import { POST as continueChat } from "@/app/api/journal/entries/[id]/continue-chat/route";
import { POST as createPersonal } from "@/app/api/journal/entries/route";
import { POST as retryPersonal } from "@/app/api/journal/entries/[id]/reprocess/route";
import { POST as createHeritage } from "@/app/api/kids-discipleship/logs/route";
import { PATCH as editHeritage } from "@/app/api/kids-discipleship/logs/[id]/route";
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
vi.mock("@/utils/generateConversationName", () => ({ generateConversationName: async () => "Synthetic conversation" }));
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
  return anthropicResponse(response, returnedModel);
});

function anthropicResponse(text: string, model: string) {
  return Response.json({
    model, content: [{ type: "text", text }],
    usage: { input_tokens: 15, output_tokens: 4, output_tokens_details: { thinking_tokens: 2 } },
  });
}

function pauseNextResponse(output: object, model: string) {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  transport.mockImplementationOnce(async () => {
    started.resolve();
    await release.promise;
    return anthropicResponse(JSON.stringify(output), model);
  });
  return { started: started.promise, release: release.resolve };
}

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
  const chatIds: string[] = [];
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
    await db.$executeRaw`DELETE FROM "AnalyticsEngagementEvent" WHERE "flowId" = ANY(${operationIds}::text[])`;
    await db.prayerPersonalRequest.deleteMany({ where: { spaceId } });
    await db.chatAnalyticsEvent.deleteMany({ where: { chatId: { in: chatIds } } });
    await db.chatMessage.deleteMany({ where: { chatId: { in: chatIds } } });
    await db.chatHistory.deleteMany({ where: { id: { in: chatIds } } });
    await db.$executeRaw`DELETE FROM "AnalyticsJournalCompletion" WHERE "operationId" = ANY(${operationIds}::text[])`;
    await db.$executeRaw`DELETE FROM "AnalyticsAccountAction" WHERE "accountId" = ${userId}`;
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

  async function engagement(feature: string, entryId: string) {
    const rows = await db.$queryRaw<{ step: string }[]>`
      SELECT step FROM "AnalyticsEngagementEvent" WHERE feature = ${feature} AND "flowId" = ${entryId} AND channel = 'web' ORDER BY step
    `;
    return rows.map(row => row.step);
  }

  async function saveSuggestedPrayer(entryId: string) {
    const response = await addPrayer(new Request("http://localhost/api/prayer-tracker/requests", {
      method: "POST", body: JSON.stringify({ requestText: "Grow in patience", linkedToFamily: "household", linkedJournalEntryId: entryId }),
    }));
    expect(response.ok).toBe(true);
    return response.json();
  }

  it("links a ready Personal Journal reflection after its author joins a household", async () => {
    invalidStage = undefined;
    const member = await db.prayerMember.findFirstOrThrow({ where: { appwriteUserId: userId } });
    await db.prayerMember.update({ where: { id: member.id }, data: { appwriteUserId: null } });
    let entryId: string;
    try {
      const events = await readEvents(await createPersonal(request()));
      entryId = events[0].entry.id;
      operationIds.push(entryId);
      expect(events.at(-1)?.type).toBe("done");
      await expect(db.journalEntry.findUniqueOrThrow({ where: { id: entryId } })).resolves.toMatchObject({ spaceId: null });
    } finally {
      await db.prayerMember.update({ where: { id: member.id }, data: { appwriteUserId: userId } });
    }

    await expect(saveSuggestedPrayer(entryId)).resolves.toMatchObject({ linkedJournalEntryId: entryId, linkedEntryType: "PERSONAL" });
    expect(await engagement("personal_journal", entryId)).toEqual(["prayer_saved", "reflection_ready", "saved"]);
  });

  it("omits links to another member's private entry and another household's Heritage entry", async () => {
    const otherSpace = await db.prayerFamilySpace.create({
      data: { spaceName: "Other household", shareCode: randomUUID(), createdByUserId: userId },
    });
    const otherAuthor = await db.userProfile.create({ data: { appwriteUserId: randomUUID(), displayName: "Other author" } });
    try {
      const privateEntry = await db.journalEntry.create({
        data: { authorProfileId: otherAuthor.id, spaceId, entryType: "PERSONAL", entryText: text, tags: [] },
      });
      const heritage = await db.journalEntry.create({
        data: { authorProfileId: profileId, spaceId: otherSpace.id, entryType: "DISCIPLESHIP", entryText: text, tags: [] },
      });
      for (const id of [privateEntry.id, heritage.id]) {
        await expect(saveSuggestedPrayer(id)).resolves.toMatchObject({ linkedJournalEntryId: null, linkedEntryType: null });
      }
    } finally {
      await db.journalEntry.deleteMany({ where: { OR: [{ authorProfileId: otherAuthor.id }, { spaceId: otherSpace.id }] } });
      await db.$executeRaw`DELETE FROM "AnalyticsAccountAction" WHERE "accountId" = ${otherAuthor.appwriteUserId}`;
      await db.userProfile.delete({ where: { id: otherAuthor.id } });
      await db.prayerFamilySpace.delete({ where: { id: otherSpace.id } });
    }
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

    expect(await engagement(feature, operationId)).toEqual(["saved"]);
    await saveSuggestedPrayer(operationId);
    expect(await engagement(feature, operationId)).toEqual(["saved"]);
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

    await saveSuggestedPrayer(operationId);
    await saveSuggestedPrayer(operationId);
    if (feature === "personal_journal") {
      const chatRequest = () => new Request("http://localhost/api/journal/continue-chat", {
        method: "POST", headers: { "Idempotency-Key": "engagement-fixture" },
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await continueChat(chatRequest(), { params: Promise.resolve({ id: operationId }) });
        expect(response.ok).toBe(true);
        chatIds.push((await response.json()).chatId);
      }
      expect(await engagement(feature, operationId)).toEqual(["continued_chat", "prayer_saved", "reflection_ready", "saved"]);
    } else {
      const context = { params: Promise.resolve({ id: operationId }) };
      const edit = await editHeritageLog(context, { entryText: "A different observation." });
      expect((await readEvents(await retryHeritage(request(), context))).at(-1)?.type).toBe("done");
      expect(await engagement(feature, operationId)).toEqual(["prayer_saved", "reflection_ready", "saved"]);
      expect(await engagement(feature, edit.operationId!)).toEqual([]);
    }
  });

  async function newHeritageLog() {
    const log = await db.journalEntry.create({
      data: { spaceId, authorProfileId: profileId, subjectMemberId: memberId,
        entryType: "DISCIPLESHIP", entryText: text, category: "NURTURE", tags: [] },
    });
    operationIds.push(log.id);
    return { params: Promise.resolve({ id: log.id }) };
  }

  async function editHeritageLog(context: Awaited<ReturnType<typeof newHeritageLog>>, data: object) {
    const response = await editHeritage(new Request("http://localhost/api", {
      method: "PATCH", body: JSON.stringify(data),
    }), context);
    expect(response.status).toBe(200);
    const { heritageOperationId } = await db.journalEntry.findUniqueOrThrow({
      where: await context.params, select: { heritageOperationId: true },
    });
    if (heritageOperationId) operationIds.push(heritageOperationId);
    return { log: (await response.json()).log, operationId: heritageOperationId };
  }

  it("uses the first persisted result and model for each stage across overlapping Heritage retries", async () => {
    invalidStage = undefined;
    const context = await newHeritageLog();
    const before = transport.mock.calls.length;
    const lateReflection = { ...journalResponses.summary, summary: "Discarded reflection." };
    const slowCall1 = pauseNextResponse(lateReflection, "discarded-call1-model");
    const first = await retryHeritage(request(), context);
    await slowCall1.started;

    const reflection = { ...journalResponses.summary, summary: "The saved reflection." };
    transport.mockImplementationOnce(async () => anthropicResponse(JSON.stringify(reflection), "saved-call1-model"));
    const suggestions = journalResponses.suggestedChildPrayerRequests;
    const slowCall2 = pauseNextResponse({ ...suggestions, tags: { ...suggestions.tags, virtue: ["Discarded"] } }, "discarded-call2-model");
    const second = await retryHeritage(request(), context);
    await slowCall2.started;
    slowCall1.release();
    const firstEvents = await readEvents(first);
    slowCall2.release();
    const secondEvents = await readEvents(second);

    for (const events of [firstEvents, secondEvents]) {
      expect(events.find(event => event.type === "call1_complete").call1).toEqual(reflection);
      expect(events.find(event => event.type === "call2_complete").call2).toEqual(suggestions);
      expect(events.at(-1)).toMatchObject({ type: "done", call1: reflection, call2: suggestions });
    }
    const calls = transport.mock.calls.slice(before);
    expect(calls).toHaveLength(4);
    for (const [, init] of calls.slice(2)) {
      expect(JSON.parse(String(init?.body)).messages[0].content).toContain(reflection.summary);
    }
    const log = await db.journalEntry.findUniqueOrThrow({ where: await context.params, include: { aiOutput: true } });
    expect(log.tags).toEqual(["Parenting", "Patience", "Social skills"]);
    expect(log.aiOutput).toMatchObject({ call1: reflection, call2: suggestions,
      modelInfo: { call1Model: "saved-call1-model", call2Model: returnedModel } });
  });

  it.each(["call1", "call2"])("discards in-flight %s after a Heritage edit and retries from the edited input", async (stage) => {
    invalidStage = undefined;
    const context = await newHeritageLog();
    if (stage === "call2") {
      transport.mockImplementationOnce(async () => anthropicResponse(JSON.stringify(journalResponses.summary), "old-model"));
    }
    const pending = pauseNextResponse(stage === "call1" ? journalResponses.summary : journalResponses.suggestedChildPrayerRequests, "late-model");
    const stale = await retryHeritage(request(), context);
    await pending.started;
    const same = await editHeritageLog(context, { entryText: text });
    if (stage === "call2") expect(same.log.aiOutput.call1).toEqual(journalResponses.summary);
    const edit = stage === "call1" ? { category: "ADMONITION" } : { entryText: "A different observation." };
    const changed = await editHeritageLog(context, edit);
    expect(changed.log).toMatchObject({ ...edit, tags: [], aiOutput: null });

    const before = transport.mock.calls.length;
    const retried = await readEvents(await retryHeritage(request(), context));
    expect(retried.at(-1)?.type).toBe("done");
    const calls = transport.mock.calls.slice(before);
    expect(calls).toHaveLength(2);
    for (const [, init] of calls) {
      const prompt = JSON.parse(String(init?.body)).messages[0].content;
      expect(prompt.toLowerCase()).toContain(Object.values(edit)[0].toLowerCase());
    }
    pending.release();
    expect((await readEvents(stale)).at(-1)?.type).toBe("error");
    const saved = await db.journalEntryAI.findUniqueOrThrow({ where: { entryId: (await context.params).id } });
    expect(saved.modelInfo).toMatchObject({ call1Model: returnedModel, call2Model: returnedModel });
    const changedAgain = await editHeritageLog(context, { entryText: "Another edit." });
    expect(changedAgain.log).toMatchObject({ tags: [], aiOutput: null });
  });

  it("counts an edited Heritage log as a separate operation and resumes that revision on retry", async () => {
    invalidStage = undefined;
    const context = await newHeritageLog();
    const { id } = await context.params;
    expect((await readEvents(await retryHeritage(request(), context))).at(-1)?.type).toBe("done");

    const edit = { entryText: "A new observation about our family." };
    const revision = await editHeritageLog(context, edit);
    expect(revision.operationId).toEqual(expect.any(String));
    expect(revision.operationId).not.toBe(id);
    invalidStage = "suggestedChildPrayerRequests";
    expect((await readEvents(await retryHeritage(request(), context))).at(-1)?.type).toBe("error");
    const attempts = (operationId: string) => db.providerCallAttempt.findMany({ where: { operationId } });
    const original = await attempts(id);
    expect(original).toHaveLength(2);
    expect(original.every(row => row.completedAt)).toBe(true);
    const failed = await attempts(revision.operationId!);
    expect(failed.map(row => row.stage).sort()).toEqual(["call1", "call2"]);
    expect(failed.every(row => row.completedAt === null && row.outputTokens === 4)).toBe(true);

    expect((await editHeritageLog(context, edit)).operationId).toBe(revision.operationId);
    invalidStage = undefined;
    expect((await readEvents(await retryHeritage(request(), context))).at(-1)?.type).toBe("done");
    const completed = await attempts(revision.operationId!);
    expect(completed.map(row => row.stage).sort()).toEqual(["call1", "call2", "call2"]);
    expect(completed.every(row => row.completedAt)).toBe(true);
    expect(await attempts(id)).toHaveLength(2);
  });

  it("persists Hydrogen usage once across devotional generation and a cache hit", async () => {
    const future = new Date(Date.UTC(2200 + Math.floor(Math.random() * 900), 3, 12, 15));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(future);
    const id = getDevotionalId(future);
    expect(await db.parrotDevotionals.count({ where: { devotional_id: id } })).toBe(0);
    savedDevotionalId = id;
    const before = transport.mock.calls.length;
    expect(await (await readDevotional()).json()).toEqual({ ...devotional, readingId: id });
    expect(await (await readDevotional()).json()).toEqual({ ...devotional, readingId: id });
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
