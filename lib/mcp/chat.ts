import { createHmac } from "node:crypto";
import { z } from "zod";
import { createChatRequestSchema, createChatResponseSchema } from "@/lib/api/contracts/chat";
import { executeChatCommand } from "@/lib/api/handlers/chat";
import { chatOperationId } from "@/lib/chat-analytics";
import { getRequestTerminalState } from "@/lib/chat-request-state";
import { getChatActorId, type ChatActor } from "@/lib/guest";
import prisma from "@/lib/prisma";

import { browserGuestIdSchema, MCP_CHAT_PREFIX, mcpConversationRefSchema } from "./ownership";

export const MCP_CHAT_TIMEOUT_MS = 180_000;

const researchSource = z.object({
  toolName: z.enum(["Theological Research", "CCEL Retrieval"]),
  content: z.string(),
});

export const askParrotInput = z.strictObject({
  question: createChatRequestSchema.shape.initialQuestion,
  requestId: z.uuidv4().describe("Generate a fresh random UUIDv4 per question. Keep it private and reuse it only for retries of that question."),
  conversationRef: mcpConversationRefSchema.optional().describe("Reference from a previous answer saved to this account."),
  denomination: createChatRequestSchema.shape.denomination.describe("Tradition for a new conversation. Omit on follow-ups."),
  saveConversation: z.boolean().optional().describe("Require an authorized account to save this conversation for follow-ups."),
});

type AskInput = z.output<typeof askParrotInput>;
type Caller = { userId: string | null; callerKey: string; signal: AbortSignal };
type CompletedAnswer = { answer: string; sources?: string[] };
type AskResult = CompletedAnswer & { requestId: string; conversationRef?: string };

export class McpChatError extends Error {}

function deriveId(namespace: string, owner: string, requestId: string) {
  const secret = process.env.MCP_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new McpChatError("Parrot chat is temporarily unavailable.");
  }
  return createHmac("sha256", secret).update(JSON.stringify([namespace, owner, requestId])).digest("base64url");
}

function unavailableConversation() {
  return new McpChatError("Conversation unavailable. Start a new chat or reconnect the account that saved it.");
}

function interrupted() {
  return new McpChatError("The answer did not finish. Retry the same question with the original requestId.");
}

// Read the persisted version after the NDJSON stream closes. A partial model token
// stream (including one with an in-band error or cancelled by the client) is not an answer.
async function readTurn(chatId: string, requestId: string, userId: string) {
  return prisma.chatMessage.findMany({
    where: { chatId, requestId, chat: { userId } },
    select: { sender: true, content: true },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
  });
}

function completedAnswer(rows: Awaited<ReturnType<typeof readTurn>>): CompletedAnswer | undefined {
  const reply = rows.find(row => row.sender === "parrot");
  if (!reply) return;
  const sources: string[] = [];
  for (const row of rows) {
    if (row.sender !== "tool_summary") continue;
    // These two tools publish cited sources separately from the answer text.
    // Other tool payloads can contain process information and private memories.
    try {
      const summary = researchSource.safeParse(JSON.parse(row.content));
      if (summary.success) sources.push(summary.data.content);
    } catch {
      // Older summaries can be plain text. The answer still carries its inline citations.
    }
  }
  return sources.length ? { answer: reply.content, sources } : { answer: reply.content };
}

async function answerTurn(
  input: AskInput, request: Request, actor: ChatActor, chatId: string,
): Promise<CompletedAnswer> {
  const { question, requestId } = input;
  const userId = getChatActorId(actor);
  const rows = await readTurn(chatId, requestId, userId);
  const submission = rows.find(row => row.sender === "user");
  if (submission && submission.content !== question) {
    throw new McpChatError("This requestId already belongs to a different question.");
  }
  const completed = completedAnswer(rows);
  if (completed) return completed;
  if (request.signal.aborted) throw interrupted();

  // A killed worker can leave a submitted question plus a paid attempt without a
  // terminal transcript row. That next dispatch is still a retry for cost reporting.
  const state = getRequestTerminalState(rows);
  const retry = state === "failed" || state === "stopped" || Boolean(submission &&
    await prisma.providerCallAttempt.findFirst({
      where: { operationId: chatOperationId(chatId, requestId), feature: "chat" },
      select: { attemptId: true },
    }));
  const response = await executeChatCommand(request, { chatId, requestId, message: question, retry }, "mcp", actor);
  if (response.status === 409) {
    // A concurrent delivery may have finished between our read and submission.
    const latest = await readTurn(chatId, requestId, userId);
    if (latest.some(row => row.sender === "user" && row.content !== question)) {
      throw new McpChatError("This requestId already belongs to a different question.");
    }
    const replay = completedAnswer(latest);
    if (replay) return replay;
    throw new McpChatError((await response.json()).error);
  }
  if (!response.ok || !response.body) throw interrupted();
  const reader = response.body.getReader();
  try {
    while (!(await reader.read()).done) { /* Drain progress without buffering the transcript. */ }
  } finally {
    reader.releaseLock();
  }

  const answer = completedAnswer(await readTurn(chatId, requestId, userId));
  if (!answer) throw interrupted();
  return answer;
}

export async function askParrot(rawInput: AskInput, caller: Caller): Promise<AskResult> {
  const input = askParrotInput.parse(rawInput);
  if ((input.conversationRef || input.saveConversation) && !caller.userId) {
    throw new McpChatError("Authorize a Parrot account for a saved conversation.");
  }
  if (input.conversationRef && input.denomination) {
    throw new McpChatError("A follow-up uses the original conversation's denomination.");
  }
  const { requestId } = input;
  const actor: ChatActor = caller.userId
    ? { kind: "authenticated", userId: caller.userId }
    : { kind: "guest", guestId: `mcp-guest:${deriveId("guest", caller.callerKey, requestId)}` };
  const userId = getChatActorId(actor);
  const chatId = input.conversationRef ?? `${MCP_CHAT_PREFIX}${deriveId("chat", userId, requestId)}`;
  const { signal } = caller;
  if (signal.aborted) throw interrupted();
  const request = new Request("https://parrot.invalid/api/mcp", { method: "POST", signal });

  // Only UUIDv4 account subjects can collide with existing browser guest cookies.
  // Reserve a verified subject before writing the first chat, including after a
  // previous chat deletion. Do not retain identifiers for other account formats.
  if (caller.userId && browserGuestIdSchema.safeParse(caller.userId).success) {
    await prisma.mcpAccountIdentity.createMany({ data: [{ userId: caller.userId }], skipDuplicates: true });
  }

  if (input.conversationRef) {
    const owned = await prisma.chatHistory.findFirst({ where: { id: chatId, userId }, select: { id: true } });
    if (!owned) throw unavailableConversation();
  } else {
    const response = await executeChatCommand(request, {
      initialQuestion: input.question, clientChatId: chatId, requestId, denomination: input.denomination,
    }, "mcp", actor);
    if (response.status === 409) throw new McpChatError("This requestId already belongs to a different chat or question.");
    if (!response.ok) throw interrupted();
    const created = createChatResponseSchema.parse(await response.json());
    if (created.chatId !== chatId || created.requestId !== requestId) throw interrupted();
  }

  const answer = await answerTurn(input, request, actor, chatId);
  return caller.userId ? { ...answer, requestId, conversationRef: chatId } : { ...answer, requestId };
}
