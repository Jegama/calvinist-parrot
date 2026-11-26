import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { askParrot, askParrotInput } from "./chat";
import * as chatCommands from "@/lib/api/handlers/chat";
import { getGuestId } from "@/lib/guest";
import { transferGuestChatsToUser } from "@/lib/chat-transfer";
import { GET as listChats } from "@/app/api/user-chats/route";
import { GET as publicTranscript } from "@/app/api/v1/chats/[chatId]/route";
import { GET as websiteTranscript } from "@/app/api/web/chats/[chatId]/route";
import { POST as publicFollowup } from "@/app/api/v1/chats/[chatId]/messages/route";
import { POST as websiteFollowup } from "@/app/api/web/chats/[chatId]/messages/route";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;
let db: PrismaClient;
const alice = randomUUID();
const bob = randomUUID();
const requestIds: string[] = [];
const question = "What does it mean to show patience?";
const answer = "Be quick to listen (James 1:19).";
const citation = "[Commentary on James](https://example.org/commentary)";
let browserUser: string | null = null;
let cookie: string | undefined;
const flow = vi.hoisted(() => ({ title: vi.fn(async () => "Test conversation"), beforeAnswer: vi.fn(async () => {}), histories: [] as string[][] }));
vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUserId: () => browserUser }));
vi.mock("@/lib/appwrite/server", () => ({ GUEST_ID_COOKIE: "guestId" }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: () => cookie ? { value: cookie } : undefined,
  set: (_name: string, value: string) => { cookie = value; },
}) }));
vi.mock("@/utils/langChainAgents/tools", () => ({ toolsArray: [] }));
vi.mock("@/utils/langChainAgents/mainAgent", () => {
  const workflow = {
    async *stream(input: { messages: { content: string }[] }) {
      flow.histories.push(input.messages.slice(1).map(row => row.content));
      await flow.beforeAnswer();
      yield ["updates", { tools: { messages: [{ name: "ccelRetrieval", content: JSON.stringify({ consultedSourcesMarkdown: citation }) }] } }];
      yield ["messages", [{ contentBlocks: [{ text: answer }] }, { langgraph_node: "model" }]];
    },
  };
  return { getParrotWorkflow: async () => workflow, getMcpGuestWorkflow: () => workflow };
});
vi.mock("@/utils/generateConversationName", () => ({ generateConversationName: flow.title }));
vi.mock("@/utils/memoryExtraction", () => ({ updateUserMemoriesFromConversation: vi.fn() }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));

function newTurn() {
  const requestId = randomUUID();
  requestIds.push(requestId);
  return { question, requestId };
}
function caller(userId: string | null, callerKey = "fixture") {
  return { userId, callerKey, signal: new AbortController().signal };
}

describe("MCP chat input", () => {
  it("rejects identity overrides and requires UUIDv4 retry keys", () => {
    expect(askParrotInput.safeParse({ question, requestId: "1" }).success).toBe(false);
    expect(askParrotInput.safeParse({ question, requestId: randomUUID(), userId: alice }).success).toBe(false);
  });
});

describe.skipIf(!databaseUrl)("MCP chat adapter through the streamed chat service", () => {
  beforeAll(() => {
    vi.stubEnv("MCP_SECRET", "a local integration fixture secret of at least 32 bytes");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  });
  afterAll(async () => {
    const chats = await db.chatHistory.findMany({ where: { creationRequestId: { in: requestIds } }, select: { id: true } });
    const ids = chats.map(row => row.id);
    await db.chatAnalyticsEvent.deleteMany({ where: { chatId: { in: ids } } });
    await db.chatMessage.deleteMany({ where: { chatId: { in: ids } } });
    await db.chatHistory.deleteMany({ where: { id: { in: ids } } });
    await db.mcpAccountIdentity.deleteMany({ where: { userId: { in: [alice, bob] } } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  });

  it("preserves citations and account context on follow-up and rejects another owner's reference", async () => {
    const first = newTurn();
    const initial = await askParrot({ ...first, saveConversation: true }, caller(alice));
    expect(initial).toEqual({ answer, sources: [`### CCEL Sources\n\n${citation}`], conversationRef: expect.stringMatching(/^mcp1_/), requestId: first.requestId });
    await expect(askParrot({ ...newTurn(), conversationRef: initial.conversationRef }, caller(bob))).rejects.toThrow("Conversation unavailable");
    await expect(askParrot({ ...newTurn(), conversationRef: initial.conversationRef }, caller(null))).rejects.toThrow("Authorize");
    const followup = { ...newTurn(), question: "How can I practice that?", conversationRef: initial.conversationRef };
    const second = await askParrot(followup, caller(alice));
    expect(flow.histories.at(-1)).toEqual([question, answer, followup.question]);
    expect(second.conversationRef).toBe(initial.conversationRef);
    const attemptCount = flow.histories.length;
    expect(await askParrot(first, caller(alice))).toEqual(initial);
    expect(await askParrot(followup, caller(alice))).toEqual(second);
    await expect(askParrot({ ...followup, question: "Something else" }, caller(alice))).rejects.toThrow("different question");
    expect(flow.histories).toHaveLength(attemptCount);
  });

  it("isolates guest turns by caller and random request, with no saved continuation", async () => {
    const first = newTurn();
    const count = flow.histories.length;
    const a = await askParrot(first, caller(null, "caller-a"));
    expect(a.conversationRef).toBeUndefined();
    expect(await askParrot(first, caller(null, "caller-a"))).toEqual(a);
    await askParrot({ ...first, question: "A different guest question" }, caller(null, "caller-b"));
    await askParrot(newTurn(), caller(null, "caller-a"));
    expect(flow.histories.slice(count)).toEqual([[question], ["A different guest question"], [question]]);
    await expect(askParrot({ ...newTurn(), saveConversation: true }, caller(null))).rejects.toThrow("Authorize");
  });

  it("separates UUID account ownership from browser guest resolution, listing, transcript and transfer", async () => {
    const turn = newTurn();
    const saved = await askParrot(turn, caller(alice));
    const chatId = saved.conversationRef!;
    const params = { params: Promise.resolve({ chatId }) };
    const request = new Request("http://localhost/api/user-chats");
    try {
      cookie = alice;
      expect(await getGuestId()).toBeNull();
      expect((await (await listChats(request)).json()).chats).toEqual([]);
      cookie = alice;
      expect((await publicTranscript(request, params)).status).toBe(404);
      await transferGuestChatsToUser(alice, bob);
      expect((await db.chatHistory.findUniqueOrThrow({ where: { id: chatId } })).userId).toBe(alice);
      browserUser = alice;
      expect((await (await listChats(request)).json()).chats).toContainEqual(expect.objectContaining({ id: chatId }));
      const { messages } = await (await websiteTranscript(request, params)).json();
      expect(messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ sender: "user", content: question, requestId: turn.requestId }),
        expect.objectContaining({ sender: "parrot", content: saved.answer, requestId: turn.requestId }),
        expect.objectContaining({ sender: "tool_summary", content: saved.sources![0], requestId: turn.requestId }),
      ]));
      const next = newTurn();
      const followup = "Continue in the Parrot website.";
      const stream = await websiteFollowup(new Request("http://localhost/api/web/chats/" + chatId + "/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: next.requestId, message: followup }),
      }), params);
      expect(stream.status).toBe(200);
      await stream.text();
      const continued = await (await websiteTranscript(request, params)).json();
      expect(continued.chat.id).toBe(chatId);
      expect(continued.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ sender: "user", content: followup, requestId: next.requestId }),
        expect.objectContaining({ sender: "parrot", content: answer, requestId: next.requestId }),
      ]));
      expect(flow.histories.at(-1)).toEqual([question, answer, followup]);
      browserUser = null;
      cookie = randomUUID();
      expect(await getGuestId()).toBe(cookie);
    } finally {
      browserUser = null;
      cookie = undefined;
    }
  });

  it("reserves the first MCP question before the saved chat appears on the website", async () => {
    const visible = Promise.withResolvers<string>();
    const resume = Promise.withResolvers<void>();
    const execute = chatCommands.executeChatCommand;
    const create = vi.spyOn(chatCommands, "executeChatCommand").mockImplementationOnce(async (...args) => {
      const response = await execute(...args);
      visible.resolve((await response.clone().json()).chatId);
      await resume.promise;
      return response;
    });
    const turn = newTurn();
    const first = askParrot(turn, caller(alice));
    browserUser = alice;
    try {
      const chatId = await visible.promise;
      const next = newTurn();
      const request = () => new Request("http://localhost/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: next.requestId, message: "How can I put this into practice?" }),
      });
      const params = { params: Promise.resolve({ chatId }) };
      expect((await websiteFollowup(request(), params)).status).toBe(409);
      expect((await publicFollowup(request(), params)).status).toBe(409);
      expect(await db.chatMessage.count({ where: { chatId, requestId: next.requestId } })).toBe(0);
      resume.resolve();
      expect((await first).answer).toBe(answer);
      const stream = await websiteFollowup(request(), params);
      expect(stream.status).toBe(200);
      await stream.text();
      expect(flow.histories.at(-1)).toEqual([question, answer, "How can I put this into practice?"]);
    } finally {
      resume.resolve();
      await first;
      browserUser = null;
      create.mockRestore();
    }
  });

  it("serializes concurrent redelivery and replays the persisted result", async () => {
    const turn = newTurn();
    let started!: () => void;
    let finish!: () => void;
    const running = new Promise<void>(resolve => { started = resolve; });
    const wait = new Promise<void>(resolve => { finish = resolve; });
    flow.beforeAnswer.mockImplementationOnce(async () => { started(); await wait; });
    const first = askParrot(turn, caller(alice));
    try {
      await running;
      await expect(askParrot(turn, caller(alice))).rejects.toThrow("Another turn is running");
    } finally {
      finish();
    }
    const result = await first;
    expect(await askParrot(turn, caller(alice))).toEqual(result);
  });

  it.each([
    ["website", websiteFollowup],
    ["v1", publicFollowup],
  ] as const)("serializes MCP and %s turns in both directions", async (_channel, post) => {
    const saved = await askParrot(newTurn(), caller(alice));
    const chatId = saved.conversationRef!;
    const turn = { ...newTurn(), question: "First follow-up", conversationRef: chatId };
    const next = { ...newTurn(), question: "Second follow-up", conversationRef: chatId };
    const send = (input: typeof turn) => post(new Request("http://localhost/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: input.requestId, message: input.question }),
    }), { params: Promise.resolve({ chatId }) });
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    flow.beforeAnswer.mockImplementationOnce(() => { started.resolve(); return finish.promise; });
    browserUser = alice;
    try {
      const first = askParrot(turn, caller(alice));
      try {
        await started.promise;
        expect((await send(turn)).status).toBe(409);
        expect((await send(next)).status).toBe(409);
      } finally {
        finish.resolve();
        await first;
      }
      const startedWeb = Promise.withResolvers<void>();
      const finishWeb = Promise.withResolvers<void>();
      flow.beforeAnswer.mockImplementationOnce(() => { startedWeb.resolve(); return finishWeb.promise; });
      const stream = await send(next);
      expect(stream.status).toBe(200);
      try {
        await startedWeb.promise;
        await expect(askParrot(next, caller(alice))).rejects.toThrow("Another turn is running");
        expect(flow.histories.at(-1)).toEqual([question, answer, turn.question, answer, next.question]);
      } finally {
        finishWeb.resolve();
        await stream.text();
      }
      const attempts = flow.histories.length;
      expect((await askParrot(next, caller(alice))).answer).toBe(answer);
      expect(flow.histories).toHaveLength(attempts);
    } finally {
      browserUser = null;
    }
  });

  it("returns the saved answer at the MCP deadline even if naming is still pending", async () => {
    const naming = Promise.withResolvers<void>();
    const finishTitle = Promise.withResolvers<string>();
    flow.title.mockImplementationOnce(() => { naming.resolve(); return finishTitle.promise; });
    const deadline = new AbortController();
    const turn = newTurn();
    const asking = askParrot(turn, { ...caller(alice), signal: deadline.signal });
    try {
      await naming.promise;
      deadline.abort();
      const result = await asking;
      expect(result).toMatchObject({ answer, requestId: turn.requestId });
      expect(await askParrot(turn, caller(alice))).toEqual(result);
    } finally {
      finishTitle.resolve("Patience");
    }
  });

  it("allows a guest to retry an interrupted question with the original requestId", async () => {
    const turn = newTurn();
    flow.beforeAnswer.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(askParrot(turn, caller(null))).rejects.toThrow("The answer did not finish");
    await expect(askParrot(turn, caller(null))).resolves.toMatchObject({ answer });
  });
});
