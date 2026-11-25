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
import { GET as webTranscript } from "@/app/api/web/chats/[chatId]/route";
import { POST as confirmReply } from "@/app/api/web/chats/[chatId]/reply-visible/route";
import { getChatEngagement } from "@/lib/analytics/engagement-chat";
import { POST as sendWebMessage } from "@/app/api/web/chats/[chatId]/messages/route";
import { POST as stop } from "@/app/api/web/chats/[chatId]/requests/[requestId]/stop/route";
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
const accountId = randomUUID();
const entryId = randomUUID();
const chatIds: string[] = [];

vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
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
vi.mock("@/utils/generateConversationName", () => ({ generateConversationName: async () => "Patience" }));
vi.mock("@/utils/memoryExtraction", () => ({ updateUserMemoriesFromConversation: async () => {} }));
vi.mock("@/utils/langChainAgents/tools", () => ({ toolsArray: [] }));
vi.mock("@/utils/langChainAgents/mainAgent", () => ({
  getParrotWorkflow: async () => ({
    async *stream() {
      if (failGeneration) throw new Error("Synthetic provider failure");
      yield ["updates", { tools: { messages: [{ name: "lookup", content: "Synthetic result" }] } }];
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
  return (await response.text()).trim().split("\n").map(line => JSON.parse(line).type as string);
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
    await db.$executeRaw`DELETE FROM "AnalyticsEngagementEvent" e USING "ChatAnalyticsEvent" c
      WHERE e.feature = 'chat' AND e."flowId" = c."operationId" AND c."chatId" = ANY(${chatIds}::text[])`;
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
      const events = await streamEvents(await sendMessage(channel, chatId, body));
      expect(events).toEqual(expect.arrayContaining(["tool_summary", "parrot", "done"]));
      expect(await (await createQuestion(channel, chatId, requestId)).json()).toEqual(first);
      expect((await sendMessage(channel, chatId, { ...body, retry: true })).status).toBe(409);
      expect(guestCookies.has("guestId")).toBe(true);
      const stored = await receipts(chatId);
      expect(stored.map(row => row.kind)).toEqual(["created", "reply", "submission"]);
      expect(new Set(stored.map(row => row.operationId)).size).toBe(1);
      operations.add(stored[0].operationId);
      const transcript = await webTranscript(new Request("http://localhost/chat"), { params: Promise.resolve({ chatId }) });
      const target = transcript.headers.get("x-parrot-reply-target");
      const expectedReply = (await transcript.json()).messages.find((row: { sender: string }) => row.sender === "parrot");
      expect(target).toBe(channel === "web" ? expectedReply.id : null);
      expect(transcript.headers.get("x-parrot-reply-operation")).toBe(channel === "web" ? stored[0].operationId : null);
      for (let replay = 0; replay < 2; replay++) {
        expect((await confirmReply(post("/reply-visible", { operation: stored[0].operationId }), { params: Promise.resolve({ chatId }) })).status).toBe(204);
      }
      const [{ count }] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "AnalyticsEngagementEvent"
        WHERE feature = 'chat' AND step = 'reply_visible' AND "flowId" = ${stored[0].operationId}`;
      expect(count).toBe(channel === "web" ? 1 : 0);
      expect((await webTranscript(new Request("http://localhost/chat"), { params: Promise.resolve({ chatId }) })).headers.has("x-parrot-reply-target")).toBe(false);
      expect(stored.every(row => row.channel === channel && row.actorKind === "guest" && row.accountId === null)).toBe(true);
    }
    expect(operations.size).toBe(chatChannels.length);
    // Use a fixed, completed reporting period isolated from other database fixtures.
    const report = await db.$transaction(async tx => {
      await tx.chatAnalyticsEvent.updateMany({
        where: { chatId: { in: ids } }, data: { occurredAt: new Date("1997-05-05T18:00:00Z") },
      });
      await tx.$executeRaw`UPDATE "AnalyticsEngagementEvent" SET "occurredAt" = '1997-05-05T18:30:00Z'
        WHERE feature = 'chat' AND "flowId" = ANY(${Array.from(operations)}::text[])`;
      const window = getReportingWindow(7, "1997-05-06");
      expect(await getChatEngagement(window, tx)).toEqual({
        allStarted: 1, started: 1, visible: 1, followup: 0, public_api: 1, mcp: 1, unknown: 0,
      });
      const metrics = await getAnalyticsMetrics(window, [], tx);
      // The same conversation can have unrelated, out-of-order and repeated turns.
      const addTurn = (channel: string, at: string, chatId = ids[0]) => tx.chatAnalyticsEvent.create({
        data: { chatId, kind: "submission", actorKind: "guest", operationId: randomUUID(), channel, occurredAt: new Date(at) },
      });
      await addTurn("web", "1997-05-05T18:15:00Z");
      await addTurn("public_api", "1997-05-05T18:40:00Z");
      await addTurn("web", "1997-05-05T18:45:00Z", ids[2]); // first submission was MCP
      expect(await getChatEngagement(window, tx)).toMatchObject({ started: 1, visible: 1, followup: 0 });
      await addTurn("web", "1997-05-05T18:55:00Z");
      await addTurn("web", "1997-05-05T19:10:00Z");
      const incompleteId = newChatId();
      await addTurn("web", "1997-05-05T19:15:00Z", incompleteId);
      expect(await getChatEngagement(window, tx)).toMatchObject({ started: 2, visible: 1, followup: 1 });
      expect(await getChatEngagement(window, tx, new Date("1997-05-05T18:05:00Z"))).toMatchObject({
        allStarted: 2, started: 1, visible: 0, followup: 0, mcp: 1, public_api: 1,
      });
      return metrics;
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

  it("confirms a visible answer before a fast follow-up and rejects a different owner's acknowledgment", async () => {
    signedInId = null;
    guestCookies.clear();
    const chatId = newChatId();
    const requestId = randomUUID();
    const first = await (await createQuestion("web", chatId, requestId)).json();
    await streamEvents(await sendMessage("web", chatId, { requestId, messageId: first.messageId, message: fixtureQuestion, isAutoTrigger: true }));
    const operation = chatOperationId(chatId, requestId);
    signedInId = randomUUID();
    expect((await confirmReply(post("/reply-visible", { operation }), { params: Promise.resolve({ chatId }) })).status).toBe(404);
    signedInId = null;
    const followupId = randomUUID();
    const followup = post("/messages", { requestId: followupId, message: "Please explain further." });
    followup.headers.set("x-parrot-visible-operation", operation);
    await streamEvents(await sendWebMessage(followup, { params: Promise.resolve({ chatId }) }));
    const [result] = await db.$queryRaw<{ ordered: boolean }[]>`
      SELECT (v."occurredAt" AT TIME ZONE 'UTC') <= f."occurredAt" AS ordered
      FROM "AnalyticsEngagementEvent" v JOIN "ChatAnalyticsEvent" f ON f."chatId" = ${chatId}
      WHERE v.feature = 'chat' AND v.step = 'reply_visible' AND v."flowId" = ${operation}
        AND f.kind = 'submission' AND f."operationId" = ${chatOperationId(chatId, followupId)}`;
    expect(result?.ordered).toBe(true);
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
    const repeatedBranch = await branch(post("/api/parrot-chat/branch", branchBody));
    const replay = await repeatedBranch.json();
    chatIds.push(replay.chatId);
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
