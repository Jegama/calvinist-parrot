import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as legacyChat } from "@/app/api/parrot-chat/route";
import { POST as createPublicChat } from "@/app/api/v1/chats/route";
import { POST as branch } from "@/app/api/parrot-chat/branch/route";
import { POST as handoff } from "@/app/api/journal/entries/[id]/continue-chat/route";
import { POST as stop } from "@/app/api/web/chats/[chatId]/requests/[requestId]/stop/route";
import { getChatSpend } from "@/lib/analytics/chat-spend";
import { recordUsageAttempt, startUsageAttempt } from "@/lib/provider-usage";
import { getAnalyticsMetrics } from "@/lib/analytics/metrics";
import { getReportingWindow } from "@/lib/analytics/period";
import { chatOperationId } from "@/lib/chat-analytics";
import { transferGuestChatsToUser } from "@/lib/chat-transfer";
import { chatChannels, createQuestion, fixtureQuestion, post, sendMessage } from "./fixtures/chat-channels";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

let db: PrismaClient;
let pool: Pool;
const guestCookies = new Map<string, string>();
let signedInId: string | null = null;
let failGeneration = false;
type TurnContext = { operationId: string; isRetry: boolean };
const modelContexts: TurnContext[] = [];
const titleContexts: Array<TurnContext | undefined> = [];
const memoryContexts: TurnContext[] = [];
const afterResponse: Array<() => Promise<void>> = [];
const accountId = randomUUID();
const entryId = randomUUID();
const chatIds: string[] = [];

// Synthetic provider boundaries. Use the real recorder and dashboard query so
// a lost turn ID or retry flag in the streaming handler breaks reconciliation.
const costDay = new Date("2044-02-07T06:00:00Z");
const costDayEnd = new Date("2044-02-08T06:00:00Z");
const operationsToPrice = new Set<string>();

async function recordFixtureCall(turn: TurnContext | undefined, stage: string, failed = false) {
  if (!turn || !operationsToPrice.has(turn.operationId)) return;
  const attempt = startUsageAttempt({ feature: "chat", stage, ...turn }, { provider: "anthropic", model: "claude-haiku-5-5" });
  attempt.startedAt = stage === "memory" ? costDayEnd : costDay;
  const usage = { input_tokens: 1000, output_tokens: 100 };
  await recordUsageAttempt(attempt, failed ? "provider_error" : "success", 50, attempt.requestedModel, usage);
  // A second delivery of an identical receipt must not add another charge.
  await recordUsageAttempt(attempt, failed ? "provider_error" : "success", 50, attempt.requestedModel, usage);
}

vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: (work: () => Promise<void>) => afterResponse.push(work),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => guestCookies.has(name) ? { value: guestCookies.get(name) } : undefined,
    set: (name: string, value: string) => guestCookies.set(name, value),
  }),
}));
vi.mock("@/lib/appwrite/server", () => ({ GUEST_ID_COOKIE: "guestId" }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUserId: async () => signedInId,
  requireAuthenticatedUser: async () => ({ userId: signedInId, errorResponse: null }),
}));
vi.mock("@/utils/generateConversationName", () => ({ generateConversationName: async (_text: string, context?: TurnContext) => {
  titleContexts.push(context);
  await recordFixtureCall(context, "title");
  return "Patience";
} }));
vi.mock("@/utils/memoryExtraction", () => ({ updateUserMemoriesFromConversation: async (_user: string, _messages: unknown, context: TurnContext) => {
  memoryContexts.push(context);
  await recordFixtureCall(context, "memory");
} }));
vi.mock("@/utils/langChainAgents/tools", () => ({ toolsArray: [] }));
vi.mock("@/utils/langChainAgents/mainAgent", () => ({
  getParrotWorkflow: async () => ({
    async *stream(_input: unknown, { configurable }: { configurable: { chatUsage: TurnContext } }) {
      modelContexts.push(configurable.chatUsage);
      await recordFixtureCall(configurable.chatUsage, "agent", failGeneration);
      if (failGeneration) throw new Error("Synthetic provider failure");
      yield ["updates", { tools: { messages: [{ name: "lookup", content: "Synthetic result" }] } }];
      await recordFixtureCall(configurable.chatUsage, "agent");
      yield ["messages", [{ contentBlocks: [{ text: "A patient person listens carefully." }] }, { langgraph_node: "model" }]];
    },
  }),
}));

function newChatId() {
  const id = randomUUID();
  chatIds.push(id);
  return id;
}

async function streamEvents(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("ndjson");
  const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line).type as string);
  for (const work of afterResponse.splice(0)) await work();
  return events;
}

async function receipts(chatId: string) {
  return db.chatAnalyticsEvent.findMany({
    where: { chatId },
    select: { kind: true, actorKind: true, accountId: true, channel: true, operationId: true },
    orderBy: { kind: "asc" },
  });
}

describe.skipIf(!databaseUrl)("chat analytics through server entry points and PostgreSQL", () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await db.providerCallAttempt.deleteMany({ where: { operationId: { in: [...operationsToPrice] } } });
    await db.chatAnalyticsEvent.deleteMany({ where: { chatId: { in: chatIds } } });
    await db.chatMessage.deleteMany({ where: { chatId: { in: chatIds } } });
    await db.chatHistory.deleteMany({ where: { id: { in: chatIds } } });
    await db.journalEntry.deleteMany({ where: { id: entryId } });
    await db.$executeRaw`DELETE FROM "AnalyticsAccountAction" WHERE "sourceId" = ${entryId}`;
    await db.userProfile.deleteMany({ where: { appwriteUserId: accountId } });
    await db.$disconnect();
    await pool.end();
  });

  it("records one genuine turn per channel and three combined when the same question is replayed", async () => {
    signedInId = null;
    const ids: string[] = [];
    const operations = new Set<string>();
    const requestId = randomUUID();
    for (const channel of chatChannels) {
      guestCookies.clear();
      const chatId = newChatId();
      ids.push(chatId);
      const created = await createQuestion(channel, chatId, requestId);
      expect(created.ok).toBe(true);
      const first = await created.json();
      expect(await (await createQuestion(channel, chatId, requestId)).json()).toEqual(first);
      const body = { requestId, messageId: first.messageId, message: fixtureQuestion, isAutoTrigger: true };
      operationsToPrice.add(chatOperationId(chatId, requestId));
      if (channel === "web") {
        failGeneration = true;
        try {
          expect(await streamEvents(await sendMessage(channel, chatId, body))).toContain("error");
          const calls = modelContexts.length;
          expect((await sendMessage(channel, chatId, body)).status).toBe(409);
          expect(modelContexts.length).toBe(calls);
        } finally {
          failGeneration = false;
        }
      }
      const events = await streamEvents(await sendMessage(channel, chatId, { ...body, retry: channel === "web" }));
      expect(events).toEqual(expect.arrayContaining(["tool_summary", "parrot", "done"]));
      expect(await (await createQuestion(channel, chatId, requestId)).json()).toEqual(first);
      expect((await sendMessage(channel, chatId, { ...body, retry: true })).status).toBe(409);
      expect(guestCookies.has("guestId")).toBe(true);
      const stored = await receipts(chatId);
      expect(stored.map(row => row.kind)).toEqual(["created", "reply", "submission"]);
      expect(new Set(stored.map(row => row.operationId)).size).toBe(1);
      operations.add(stored[0].operationId);
      const expectedContext = { operationId: stored[0].operationId, isRetry: channel === "web" };
      expect(modelContexts.at(-1)).toEqual(expectedContext);
      expect(titleContexts.at(-1)).toEqual(expectedContext);
      expect(memoryContexts.at(-1)).toEqual(expectedContext);
      expect(stored.every(row => row.channel === channel && row.actorKind === "guest" && row.accountId === null)).toBe(true);
    }
    expect(operations.size).toBe(chatChannels.length);
    await db.chatAnalyticsEvent.updateMany({ where: { chatId: { in: ids } }, data: { occurredAt: costDay } });
    const { byChannel, stages } = await getChatSpend({ start: costDay, end: costDayEnd });
    const [combined, web, api, mcp] = byChannel;
    // Two model invocations, title and background memory for each channel,
    // plus the original paid failure on web. All four calls in its retried turn count as retry spend.
    const perCall = .00015;
    expect(combined).toMatchObject({ completions: 3, attempts: 13, measured: 13, priced: 13 });
    expect(combined.costPerCompletionUsd).toBeCloseTo(13 * perCall / 3, 9);
    expect(web.retrySpendUsd).toBeCloseTo(4 * perCall, 9);
    expect(api.estimatedSpendUsd).toBeCloseTo(4 * perCall, 9);
    expect(mcp.estimatedSpendUsd).toBeCloseTo(4 * perCall, 9);
    expect(stages.find(row => row.stage === "memory")?.attempts).toBe(3);
    // Use a fixed, completed reporting period isolated from other database fixtures.
    const report = await db.$transaction(async tx => {
      await tx.chatAnalyticsEvent.updateMany({
        where: { chatId: { in: ids } }, data: { occurredAt: new Date("1997-05-05T18:00:00Z") },
      });
      return getAnalyticsMetrics(getReportingWindow(7, "1997-05-06"), [], tx);
    });
    expect(report.hero.newChats.current).toBe(3);
    expect(report.hero.userMessages.current).toBe(3);
    expect(report.hero.averageMessages.current).toBe(2);
    expect(report.growth.at(-1)).toMatchObject({ newChats: 3, userMessages: 3, newAccounts: 0 });
    expect(report.channels.map(row => [row.channel, row.userMessages, row.activeChats])).toEqual([
      ["combined", 3, 3], ["web", 1, 1], ["public_api", 1, 1], ["mcp", 1, 1], ["unknown", 0, 0],
    ]);
    expect(report.guest).toMatchObject({ newChats: 1, userMessages: 1, activeChats: 1, averageMessages: 2 });
  });

  it("preserves guest provenance when an API retry after login finishes a stopped website turn", async () => {
    signedInId = null;
    guestCookies.clear();
    const chatId = newChatId();
    const requestId = randomUUID();
    const created = await createQuestion("web", chatId, requestId);
    expect(created.ok).toBe(true);
    const stopResult = await stop(post("/stop", {}), { params: Promise.resolve({ chatId, requestId }) });
    expect(await stopResult.json()).toEqual({ stopped: true, completed: false });
    expect((await receipts(chatId)).map(row => row.kind)).toEqual(["created", "submission"]);
    await transferGuestChatsToUser(guestCookies.get("guestId")!, accountId);
    signedInId = accountId;
    const retry = { message: fixtureQuestion, requestId, retry: true };
    failGeneration = true;
    try {
      expect(await streamEvents(await sendMessage("public_api", chatId, retry))).toContain("error");
    } finally {
      failGeneration = false;
    }
    expect((await receipts(chatId)).map(row => row.kind)).toEqual(["created", "submission"]);
    expect(await streamEvents(await sendMessage("public_api", chatId, retry))).toContain("parrot");
    const retryContext = { operationId: chatOperationId(chatId, requestId), isRetry: true };
    expect(modelContexts.slice(-2)).toEqual([retryContext, retryContext]);
    expect(memoryContexts.at(-1)).toEqual(retryContext);
    const initial = await receipts(chatId);
    expect(initial.map(row => row.kind)).toEqual(["created", "reply", "submission"]);
    expect(initial.every(row => row.actorKind === "guest" && row.channel === "web" && row.accountId === null)).toBe(true);
    const messageId = randomUUID();
    const nextTurn = { requestId: randomUUID(), messageId, message: "How can I put that into practice?" };
    expect(await streamEvents(await sendMessage("public_api", chatId, nextTurn))).toContain("parrot");
    const accountReceipts = (await receipts(chatId)).filter(row => row.accountId === accountId);
    expect(accountReceipts.map(row => [row.kind, row.channel, row.actorKind])).toEqual([
      ["reply", "public_api", "account"], ["submission", "public_api", "account"],
    ]);

    const editedText = "How can I be more patient today?";
    const branchBody = { sourceChatId: chatId, sourceMessageId: messageId, editedText, requestId: randomUUID() };
    const branched = await branch(post("/api/parrot-chat/branch", branchBody));
    expect(branched.ok).toBe(true);
    const edit = await branched.json();
    chatIds.push(edit.chatId);
    const branchOperation = chatOperationId(edit.chatId, edit.requestId);
    expect(titleContexts.filter(turn => turn?.operationId === branchOperation)).toHaveLength(1);
    const repeatedBranch = await branch(post("/api/parrot-chat/branch", branchBody));
    const replay = await repeatedBranch.json();
    chatIds.push(replay.chatId);
    expect(titleContexts.filter(turn => turn?.operationId === branchOperation)).toHaveLength(1);
    expect(replay).toMatchObject({ chatId: edit.chatId, editedMessageId: edit.editedMessageId, requestId: edit.requestId });
    expect(await db.chatMessage.count({ where: { chatId: edit.chatId } })).toBeGreaterThan(2);
    expect(await streamEvents(await sendMessage("web", edit.chatId, {
      message: editedText, messageId: edit.editedMessageId, requestId: edit.requestId, isAutoTrigger: true,
    }))).toContain("parrot");
    expect((await receipts(edit.chatId)).map(row => [row.kind, row.channel])).toEqual([
      ["created", "web"], ["reply", "web"], ["submission", "web"],
    ]);
  });

  it("attributes new writes by route and ignores a caller-supplied channel", async () => {
    signedInId = null;
    for (const [route, path, channel] of [
      [createPublicChat, "/api/v1/chats", "public_api"],
      [legacyChat, "/api/parrot-chat", "unknown"],
    ] as const) {
      const chatId = newChatId();
      const request = post(path, { clientChatId: chatId, initialQuestion: fixtureQuestion });
      request.headers.set("x-channel", "web");
      expect((await route(request)).ok).toBe(true);
      expect((await receipts(chatId)).map(row => [row.kind, row.channel])).toEqual([
        ["created", channel], ["submission", channel],
      ]);
    }
  });

  it("backfills historical Calvin replies and recoverable submissions, excluding copies and seed pairs", async () => {
    const migration = await readFile("prisma/migrations/20261124000000_chat_analytics/migration.sql", "utf8");
    const client = await pool.connect();
    const schema = "chat_fixture_" + randomUUID().replaceAll("-", "");
    try {
      // Run the actual migration in a transaction-private schema, including its
      // unqualified function calls and the post-deploy reconciliation pass.
      await client.query(`BEGIN;
        CREATE SCHEMA ${schema};
        SET LOCAL search_path TO ${schema};
        CREATE TABLE "chatHistory" (id text, "createdAt" timestamp, "creationRequestId" text,
          category text DEFAULT '', subcategory text DEFAULT '', issue_type text DEFAULT '');
        CREATE TABLE "chatMessage" (id text, "chatId" text, "requestId" text, timestamp timestamp, sender text, content text);
        INSERT INTO "chatHistory" (id, "createdAt", "creationRequestId") VALUES
          ('original', '2001-06-01', NULL), ('branch', '2001-06-05', NULL), ('import', '2001-06-04', 'qa');
        INSERT INTO "chatHistory" VALUES ('journal', '2001-06-03', NULL, 'journal', 'reflection', 'personal');
        INSERT INTO "chatMessage" VALUES
          ('m1','original',NULL,'2001-06-01','user','question'), ('m2','original',NULL,'2001-06-01','calvin','answer'),
          ('m3','original','turn','2001-06-02','user','followup'), ('m4','original','turn','2001-06-02','parrot','reply'),
          ('m5','original','turn','2001-06-02','tool_summary','tool'), ('m6','original','turn','2001-06-02','system_error','error'),
          ('m7','original','turn','2001-06-02','system_stopped','stop'), ('m8','original','turn','2001-06-02','parrot','reply'),
          ('b1','branch',NULL,'2001-06-01','user','question'), ('b2','branch',NULL,'2001-06-01','calvin','answer'),
          ('b3','branch','edit','2001-06-05','user','edited followup'),
          ('j1','journal',NULL,'2001-06-03','user','journal text'), ('j2','journal',NULL,'2001-06-03','parrot','reflection'),
          ('q1','import','qa','2001-06-04','user','imported question'), ('q2','import','qa','2001-06-04','parrot','imported answer');
      `);
      await client.query(migration);
      const { rows } = await client.query(`SELECT "chatId", array_agg(kind ORDER BY kind) AS kinds,
        bool_and("actorKind" = 'unknown' AND channel = 'unknown' AND "accountId" IS NULL) AS unknown
        FROM "ChatAnalyticsEvent" GROUP BY "chatId" ORDER BY "chatId"`);
      expect(rows).toEqual([
        { chatId: "branch", kinds: ["created", "submission"], unknown: true },
        { chatId: "import", kinds: ["created"], unknown: true },
        { chatId: "journal", kinds: ["created"], unknown: true },
        { chatId: "original", kinds: ["created", "reply", "reply", "submission", "submission"], unknown: true },
      ]);
      await client.query(`
        INSERT INTO "chatHistory" (id, "createdAt", "creationRequestId") VALUES ('overlap', '2001-06-08', 'live');
        INSERT INTO "chatMessage" VALUES
          ('seed1','overlap','context','2001-06-08','user','copied seed',true),
          ('seed2','overlap','context','2001-06-08','parrot','copied context',true),
          ('live1','overlap','live','2001-06-08','user','submitted',false),
          ('live2','overlap','live','2001-06-09','parrot','answer',false),
          ('legacy','overlap','new','2001-06-09','user','submitted by old server',false),
          ('late','overlap','late','2001-06-10','user','past exclusive end',false)
      `);
      await client.query(`INSERT INTO "ChatAnalyticsEvent"
        ("chatId", "operationId", kind, channel, "actorKind", "accountId", "occurredAt")
        VALUES ('overlap', $1, 'submission', 'web', 'account', 'reader', '2001-06-08')`,
      [chatOperationId("overlap", "live")]);
      for (let pass = 0; pass < 2; pass++) {
        await client.query("SELECT backfill_chat_analytics('2001-06-08', '2001-06-10')");
      }
      const overlap = await client.query(`SELECT kind, channel, "accountId", "operationId" FROM "ChatAnalyticsEvent"
        WHERE "chatId" = 'overlap' ORDER BY kind, channel`);
      expect(overlap.rows).toEqual([
        { kind: "created", channel: "unknown", accountId: null, operationId: chatOperationId("overlap", "live") },
        { kind: "reply", channel: "web", accountId: "reader", operationId: chatOperationId("overlap", "live") },
        { kind: "submission", channel: "unknown", accountId: null, operationId: chatOperationId("overlap", "new") },
        { kind: "submission", channel: "web", accountId: "reader", operationId: chatOperationId("overlap", "live") },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("counts a journal handoff as a created chat without counting its two seeded messages", async () => {
    signedInId = accountId;
    const profile = await db.userProfile.create({ data: { appwriteUserId: accountId, displayName: "Test reader" } });
    await db.journalEntry.create({ data: { id: entryId, authorProfileId: profile.id, entryText: "A synthetic journal entry." } });
    const response = await handoff(post("/continue-chat", {}), { params: Promise.resolve({ id: entryId }) });
    expect(response.status).toBe(200);
    const { chatId } = await response.json();
    chatIds.push(chatId);
    expect(await db.chatMessage.count({ where: { chatId } })).toBe(2);
    expect(await receipts(chatId)).toEqual([expect.objectContaining({ kind: "created", channel: "web", actorKind: "account" })]);
  });
});
