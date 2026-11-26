// Shared chat runtime used by the versioned API and legacy adapter.

// export const maxDuration = 60;

import type { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { sendError, sendProgress } from "@/lib/progressUtils";
import prisma from "@/lib/prisma";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { getMcpGuestWorkflow, getParrotWorkflow } from "@/utils/langChainAgents/mainAgent";
import { toolsArray } from "@/utils/langChainAgents/tools";
import { generateConversationName } from "@/utils/generateConversationName";
import { updateUserMemoriesFromConversation } from "@/utils/memoryExtraction";
import { buildParrotSystemPrompt } from "@/utils/buildParrotSystemPrompt";
import { getChatActorId, resolveChatActor, type ChatActor } from "@/lib/guest";
import { browserGuestCannotAccess, browserGuestChatFilter, MCP_CHAT_PREFIX } from "@/lib/mcp/ownership";
import { evaluateRetry } from "@/lib/chat-requests";
import { chatOperationId, pendingVisibleReply, recordChatEvents, recordChatReply, type ChatChannel } from "@/lib/chat-analytics";
import { recordEngagement } from "@/lib/analytics/engagement-store";
import { resolveEffectiveDenomination } from "@/lib/chat-context";
import {
  getRequestTerminalState,
  selectTerminalSafeMessages,
  type RequestTerminalState,
} from "@/lib/chat-request-state";
import {
  createChatRequestSchema,
  createChatResponseSchema,
  getChatParamsSchema,
  getChatResponseSchema,
  legacyGetChatQuerySchema,
  legacyGetChatResponseSchema,
  legacyParrotChatRequestSchema,
  sendChatMessageRequestSchema,
  stopChatParamsSchema,
  stopChatRequestSchema,
  stopChatResponseSchema,
} from "@/lib/api/contracts";
import {
  executeLegacySafely,
  executeV1Safely,
  LEGACY_API_HEADERS,
  parseJsonRequest,
  recordLegacyApiUse,
  withHeaders,
} from "@/lib/api/handlers/http";
import {
  acquireChatCreationLocks,
  acquireRequestPersistenceLock,
} from "@/lib/api/handlers/request-persistence-lock";

export type ChatCommand = {
  chatId?: string;
  message?: string;
  initialQuestion?: string;
  initialAnswer?: string;
  category?: string;
  subcategory?: string;
  issueType?: string;
  denomination?: string;
  isAutoTrigger?: boolean;
  clientChatId?: string;
  requestId?: string;
  messageId?: string;
  retry?: boolean;
  stop?: boolean;
};

export type ChatExecutor = (
  request: Request,
  command: ChatCommand,
) => Promise<Response>;

export type GetChatExecutor = (
  chatId: string | null,
  options?: { legacyShape?: boolean },
) => Promise<Response>;

async function validateJsonResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
  successStatus = response.status,
) {
  if (!response.ok) {
    return response;
  }

  const body = await response.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("API response failed contract validation", parsed.error);
    return NextResponse.json(
      { error: "Internal response validation failed" },
      { status: 500 },
    );
  }

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return NextResponse.json(parsed.data, {
    status: successStatus,
    headers,
  });
}

async function withRequestPersistenceLock<T>(
  chatId: string,
  requestId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await acquireRequestPersistenceLock(tx, chatId, requestId);
    return operation(tx);
  });
}

type ChatCreationStore = Pick<Prisma.TransactionClient, "chatHistory" | "chatAnalyticsEvent">;

type ChatCreationInput = {
  initialQuestion: string;
  initialAnswer?: string;
  category: string;
  subcategory: string;
  issueType: string;
  denomination: string;
  clientChatId?: string;
};

async function findExistingChatCreation(
  store: ChatCreationStore,
  userId: string,
  requestId: string,
  actor: ChatActor,
) {
  const existing = await store.chatHistory.findFirst({
    where: {
      userId,
      creationRequestId: requestId,
      ...browserGuestChatFilter(actor),
    },
    select: {
      id: true,
      category: true,
      subcategory: true,
      issue_type: true,
      denomination: true,
      messages: {
        where: { requestId },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
        select: {
          id: true,
          sender: true,
          content: true,
        },
      },
    },
  });
  if (!existing || existing.messages.every(row => row.sender === "user")) return existing;

  // A later streamed reply/tool/error belongs to the turn, not the create
  // payload. Keep the original comparison for old rows with unknown origin.
  const submission = await store.chatAnalyticsEvent.findFirst({
    where: {
      chatId: existing.id, operationId: chatOperationId(existing.id, requestId),
      kind: "submission", actorKind: { not: "unknown" },
    },
    select: { kind: true },
  });
  return submission
    ? { ...existing, messages: existing.messages.filter(row => row.sender === "user") }
    : existing;
}

type ExistingChatCreation = NonNullable<
  Awaited<ReturnType<typeof findExistingChatCreation>>
>;

function getIdempotentChatCreationResult(
  existing: ExistingChatCreation,
  input: ChatCreationInput,
  requestId: string,
) {
  const userMessages = existing.messages.filter(
    (message) => message.sender === "user",
  );
  const parrotMessages = existing.messages.filter(
    (message) => message.sender === "parrot",
  );
  const expectedMessageCount = input.initialAnswer ? 2 : 1;

  const isSameRequest =
    (!input.clientChatId || input.clientChatId === existing.id) &&
    existing.category === input.category &&
    existing.subcategory === input.subcategory &&
    existing.issue_type === input.issueType &&
    existing.denomination === input.denomination &&
    existing.messages.length === expectedMessageCount &&
    userMessages.length === 1 &&
    userMessages[0].content === input.initialQuestion &&
    (input.initialAnswer
      ? parrotMessages.length === 1 &&
        parrotMessages[0].content === input.initialAnswer
      : parrotMessages.length === 0);

  if (!isSameRequest) {
    return null;
  }

  return {
    chatId: existing.id,
    messageId: userMessages[0].id,
    requestId,
  };
}

async function loadChatContext(chatId: string, userId: string, denomination: string) {
  const [userProfile, previousMessages] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { appwriteUserId: userId },
      select: {
        denomination: true,
        preferredDepth: true,
        followUpTendency: true,
        spiritualStatus: true,
        gospelPresentationCount: true,
        coreDoctrineQuestions: true,
        secondaryDoctrineQuestions: true,
        tertiaryDoctrineQuestions: true,
        ministryContext: true,
        churchInvolvement: true,
      },
    }),
    prisma.chatMessage.findMany({
      where: { chatId },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      select: { sender: true, content: true },
    }),
  ]);

  // Build system prompt with pastoral context & denomination mapping
  const systemPrompt = buildParrotSystemPrompt({
    userProfile,
    denominationFallback: denomination,
    effectiveUserId: userId,
  });
  return { previousMessages, systemPrompt };
}

export async function executeChatCommand(
  request: Request,
  command: ChatCommand,
  channel: ChatChannel = "unknown",
  mcpActor?: ChatActor,
) {
  const TOOL_NODE_NAMES = new Set(["tools", ...toolsArray.map((tool) => tool.name)]);

  const {
    chatId,
    message,
    initialQuestion,
    initialAnswer,
    category,
    subcategory,
    issueType,
    denomination = "reformed-baptist",
    isAutoTrigger,
    clientChatId,
    requestId,
    messageId,
    retry = false,
    stop = false,
  } = command;

  const actor = mcpActor ?? await resolveChatActor();
  const isMcpGuest = channel === "mcp" && actor.kind === "guest";
  const effectiveUserId = getChatActorId(actor);
  const resolvedRequestId = requestId?.trim() || crypto.randomUUID();

  if (browserGuestCannotAccess(actor, chatId) || browserGuestCannotAccess(actor, clientChatId)) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (chatId && stop && requestId?.trim()) {
    const chatRecord = await prisma.chatHistory.findUnique({
      where: { id: chatId },
      select: { userId: true },
    });
    if (!chatRecord) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    if (chatRecord.userId !== effectiveUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stopResult = await withRequestPersistenceLock(
      chatId,
      resolvedRequestId,
      async (tx) => {
        const requestMessages = await tx.chatMessage.findMany({
          where: { chatId, requestId: resolvedRequestId },
          select: { sender: true },
        });
        if (
          !requestMessages.some(
            (requestMessage) => requestMessage.sender === "user",
          )
        ) {
          return "missing_user" as const;
        }

        const terminalState = getRequestTerminalState(requestMessages);
        if (terminalState === "completed") {
          return "completed" as const;
        }
        if (terminalState === "stopped") {
          return "stopped" as const;
        }
        if (terminalState === "failed") {
          return "failed" as const;
        }

        await tx.chatMessage.create({
          data: {
            chatId,
            requestId: resolvedRequestId,
            sender: "system_stopped",
            content: "Response stopped by the user.",
          },
        });
        await tx.chatHistory.update({
          where: { id: chatId },
          data: { modifiedAt: new Date() },
        });
        return "stopped" as const;
      },
    );

    if (stopResult === "missing_user") {
      return NextResponse.json(
        { error: "The original request could not be found" },
        { status: 404 },
      );
    }
    if (stopResult === "completed") {
      return NextResponse.json({ stopped: false, completed: true });
    }
    if (stopResult === "failed") {
      return NextResponse.json({
        stopped: false,
        completed: false,
        failed: true,
      });
    }

    return NextResponse.json({ stopped: true, completed: false });
  }

  // If identity and an initial message are provided but no chatId, start or
  // idempotently replay a chat creation.
  if (effectiveUserId && initialQuestion && !chatId) {
    const creationInput: ChatCreationInput = {
      initialQuestion,
      initialAnswer,
      category: category || "",
      subcategory: subcategory || "",
      issueType: issueType || "",
      denomination,
      clientChatId,
    };
    const existingCreation = await findExistingChatCreation(
      prisma,
      effectiveUserId,
      resolvedRequestId,
      actor,
    );
    if (existingCreation) {
      const replay = getIdempotentChatCreationResult(
        existingCreation,
        creationInput,
        resolvedRequestId,
      );
      return replay
        ? NextResponse.json(replay)
        : NextResponse.json(
            {
              error:
                "Request ID conflicts with an existing chat creation",
            },
            { status: 409 },
          );
    }

    const conversationName = initialAnswer
      ? await generateConversationName(
          `user: ${initialQuestion}\nparrot: ${initialAnswer}`,
        )
      : "New Conversation";

    const result = await prisma.$transaction(async (tx) => {
      await acquireChatCreationLocks(
        tx,
        effectiveUserId,
        resolvedRequestId,
        clientChatId,
      );

      const existingCreation = await findExistingChatCreation(
        tx,
        effectiveUserId,
        resolvedRequestId,
        actor,
      );
      if (existingCreation) {
        const replay = getIdempotentChatCreationResult(
          existingCreation,
          creationInput,
          resolvedRequestId,
        );
        return replay
          ? { kind: "success" as const, response: replay }
          : {
              kind: "conflict" as const,
              error: "Request ID conflicts with an existing chat creation",
            };
      }

      if (clientChatId) {
        const existingClientChat = await tx.chatHistory.findUnique({
          where: { id: clientChatId },
          select: { id: true },
        });
        if (existingClientChat) {
          return {
            kind: "conflict" as const,
            error: "Client chat ID is already in use",
          };
        }
      }

      const createdChat = await tx.chatHistory.create({
        data: {
          id: clientChatId ?? undefined,
          userId: effectiveUserId,
          creationRequestId: resolvedRequestId,
          conversationName,
          category: creationInput.category,
          subcategory: creationInput.subcategory,
          issue_type: creationInput.issueType,
          denomination,
        },
      });

      // An initial answer imports an existing Q&A exchange into a new chat.
      await recordChatEvents(tx, createdChat.id, resolvedRequestId, channel, actor,
        initialAnswer ? ["created"] : ["created", "submission"]);

      const createdMessage = await tx.chatMessage.create({
        data: {
          chatId: createdChat.id,
          requestId: resolvedRequestId,
          sender: "user",
          content: initialQuestion,
          analyticsExcluded: !!initialAnswer,
        },
      });

      if (initialAnswer) {
        await tx.chatMessage.create({
          data: {
            chatId: createdChat.id,
            requestId: resolvedRequestId,
            sender: "parrot",
            content: initialAnswer,
            analyticsExcluded: true,
          },
        });
      }

      return {
        kind: "success" as const,
        response: {
          chatId: createdChat.id,
          messageId: createdMessage.id,
          requestId: resolvedRequestId,
        },
      };
    });

    if (result.kind === "conflict") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(result.response);
  }

  // If chatID and message run main system <-- This continues the converation and is the main use case.
  if (chatId && message) {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const chatRecord = await prisma.chatHistory.findUnique({
      where: { id: chatId },
      select: { userId: true, denomination: true },
    });

    if (!chatRecord) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    if (chatRecord.userId !== effectiveUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The browser can submit a follow-up while its visibility receipt is still in flight.
    // Confirm the same verified operation first so network ordering cannot reverse the steps.
    const visible = channel === "web" && request.headers.get("x-parrot-visible-operation");
    if (visible && /^[a-f0-9]{64}$/.test(visible)) {
      const pending = await pendingVisibleReply(chatId, prisma).catch(() => undefined);
      if (pending === visible) await recordEngagement("chat", "reply_visible", visible);
    }

    // All channels can continue an account's saved MCP conversation. Hold the
    // same lease from submission until the stream has persisted its last event.
    const holder = chatId.startsWith(MCP_CHAT_PREFIX) ? crypto.randomUUID() : undefined;
    // Finish generation before a crashed worker's five-minute lease can expire.
    const signal = holder ? AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]) : request.signal;
    let leaseReleased = false;
    const releaseLease = async () => {
      if (holder && !leaseReleased) await prisma.mcpChatLease.deleteMany({ where: { chatId, holder } });
    };
    const conflict = await withRequestPersistenceLock(chatId, resolvedRequestId, async (tx) => {
      const rows = await tx.chatMessage.findMany({
        where: { chatId, requestId: resolvedRequestId },
        select: { sender: true, content: true, requestId: true },
      });
      const decision = evaluateRetry(rows, resolvedRequestId);
      const submission = rows.find(row => row.sender === "user");
      if (decision === "already_succeeded") {
        return NextResponse.json({ error: "This request already has a successful response" }, { status: 409 });
      }
      if (retry && decision === "missing_user") {
        return NextResponse.json({ error: "The original request could not be found" }, { status: 404 });
      }
      if (submission && submission.content !== message) {
        return NextResponse.json({ error: "Request ID is already associated with another message" }, { status: 409 });
      }
      const terminal = getRequestTerminalState(rows);
      if (!retry && (terminal === "failed" || terminal === "stopped")) {
        return NextResponse.json({ error: "Set retry to true to restart this request" }, { status: 409 });
      }
      if (holder) {
        const acquired = await tx.$executeRaw`
          INSERT INTO "McpChatLease" ("chatId", holder, "expiresAt")
          VALUES (${chatId}, ${holder}, now() + interval '5 minutes')
          ON CONFLICT ("chatId") DO UPDATE SET holder = EXCLUDED.holder, "expiresAt" = EXCLUDED."expiresAt"
          WHERE "McpChatLease"."expiresAt" <= now()
        `;
        if (!acquired) return NextResponse.json({
          error: "Another turn is running in this conversation. Retry shortly with the same requestId.",
        }, { status: 409 });
      }
      if (retry) {
        await tx.chatMessage.deleteMany({
          where: { chatId, requestId: resolvedRequestId, sender: { in: ["tool_summary", "system_error", "system_stopped"] } },
        });
      }
      if (!submission) {
        await tx.chatMessage.create({
          data: { id: messageId?.trim() || undefined, chatId, requestId: resolvedRequestId, sender: "user", content: message },
        });
        await recordChatEvents(tx, chatId, resolvedRequestId, channel, actor, ["submission"]);
      }
    });
    if (conflict) return conflict;

    const resolvedUserId = chatRecord.userId;
    const resolvedDenomination = chatRecord.denomination || denomination;

    type LangChainMessage =
      | InstanceType<typeof SystemMessage>
      | InstanceType<typeof HumanMessage>
      | InstanceType<typeof AIMessage>;

    type ContentBlock = { text?: string };
    interface TokenStreamEvent {
      contentBlocks?: ContentBlock[];
    }

    interface TokenStreamMetadata {
      langgraph_node?: string;
    }

    type MessageStreamChunk = [TokenStreamEvent, TokenStreamMetadata];

    interface ToolUpdateMessage {
      tool_name?: string;
      name?: string;
      content: string;
    }

    interface ToolUpdatePayload {
      messages?: ToolUpdateMessage[];
    }

    const buildParrotHistory: (
      messages: { sender: string; content: string }[],
      parrotSysPrompt: string
    ) => LangChainMessage[] = (messages, parrotSysPrompt) => {
      const history: LangChainMessage[] = [new SystemMessage(parrotSysPrompt)];
      for (const msg of messages) {
        if (msg.sender === "user") {
          history.push(new HumanMessage(msg.content));
        } else if (msg.sender === "parrot") {
          history.push(new AIMessage(msg.content));
        }
      }
      return history;
    };

    const { previousMessages, systemPrompt: newParrotSysPrompt } =
      await loadChatContext(chatId, resolvedUserId, resolvedDenomination).catch(async error => {
        await releaseLease();
        throw error;
      });

    // Capture variables for stream closure
    const capturedUserId = resolvedUserId;
    const capturedChatId = chatId;
    const capturedRequestId = resolvedRequestId;
    const chatUsage = { operationId: chatOperationId(chatId, resolvedRequestId), isRetry: retry === true };

    const stream = new ReadableStream({
      async start(controller) {
        // Message accumulator - initialized from pre-fetched data
        const conversationMessages: { sender: string; content: string }[] = previousMessages.map((msg) => ({
          sender: msg.sender,
          content: msg.content,
        }));
        let hasAnnouncedDrafting = false;
        const toolsWithCustomProgress = new Set<string>();
        const emittedToolSummaries = new Set<string>();
        const customSummaryByTool = new Map<string, string>();
        const pendingMessages: Prisma.chatMessageCreateManyInput[] = [];
        const toolNodesForStream = new Set<string>(TOOL_NODE_NAMES);
        let messageSequence = 0;
        const baseTimestampMs = Date.now();

        const enqueueMessage = (sender: string, content: string) => {
          pendingMessages.push({
            chatId: capturedChatId,
            requestId: capturedRequestId,
            sender,
            content,
            // Ensure stable chronology even when createMany writes rows in one batch.
            timestamp: new Date(baseTimestampMs + messageSequence++),
          });
        };

        const canonicalToolKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

        const displayToolName = (name: string) => {
          const explicitMap: Record<string, string> = {
            BibleCommentary: "Bible Commentary",
            bibleCrossReferences: "Cross References",
            userMemoryRecall: "Memory Recall",
            supplementalArticleSearch: "Theological Research",
            ccelRetrieval: "CCEL Retrieval",
            generalSearch: "Web Search",
          };
          if (explicitMap[name]) return explicitMap[name];
          return name
            .replace(/[_-]+/g, " ")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/\b\w/g, (m) => m.toUpperCase());
        };

        const summarizeGenericToolOutput = (toolName: string, parsed: unknown) => {
          if (typeof parsed === "string") {
            const value = parsed.trim();

            if (displayToolName(toolName) === "Lookup Verse") {
              const lower = value.toLowerCase();
              const hasNotFound = lower.includes("verse not found");
              const hasMultiReferenceDelimiter = /;|,\s*[1-3]?[a-z]/i.test(value);
              if (hasNotFound && hasMultiReferenceDelimiter) {
                return "Verse lookup expects one reference per call (for example \"John 3:16\"). Multiple references were bundled together, so this lookup could not resolve them.";
              }
            }

            return value.length > 0 ? value : `### ${displayToolName(toolName)}\n\nTool completed successfully.`;
          }

          if (Array.isArray(parsed)) {
            return `### ${displayToolName(toolName)}\n\nReturned ${parsed.length} item${parsed.length === 1 ? "" : "s"}.`;
          }

          if (parsed && typeof parsed === "object") {
            const record = parsed as Record<string, unknown>;

            const directTextKeys = ["summary", "content", "text", "answer", "result", "message"];
            for (const key of directTextKeys) {
              const value = record[key];
              if (typeof value === "string" && value.trim().length > 0) {
                if (displayToolName(toolName) === "Lookup Verse") {
                  const lower = value.toLowerCase();
                  const hasNotFound = lower.includes("verse not found");
                  const hasMultiReferenceDelimiter = /;|,\s*[1-3]?[a-z]/i.test(value);
                  if (hasNotFound && hasMultiReferenceDelimiter) {
                    return "Verse lookup expects one reference per call (for example \"John 3:16\"). Multiple references were bundled together, so this lookup could not resolve them.";
                  }
                }
                return value.trim();
              }
            }

            const results = record.results;
            if (Array.isArray(results) && results.length > 0) {
              const links = results
                .slice(0, 8)
                .map((item) => {
                  if (!item || typeof item !== "object") return null;
                  const row = item as Record<string, unknown>;
                  const title = typeof row.title === "string" ? row.title : "Untitled";
                  const url = typeof row.url === "string" ? row.url : null;
                  if (url) return `- [${title}](${url})`;
                  return `- ${title}`;
                })
                .filter((line): line is string => Boolean(line));

              if (links.length > 0) {
                return `### ${displayToolName(toolName)}\n\n${links.join("\n")}`;
              }
            }

            const keys = Object.keys(record);
            return `### ${displayToolName(toolName)}\n\nReturned data fields: ${keys.join(", ") || "(none)"}.`;
          }

          return `### ${displayToolName(toolName)}\n\nTool completed successfully.`;
        };

        const emitToolSummary = (toolName: string, content: string, raw?: unknown) => {
          const normalizedToolName = displayToolName(toolName);
          const canonical = canonicalToolKey(normalizedToolName);
          if (emittedToolSummaries.has(canonical)) {
            return;
          }
          emittedToolSummaries.add(canonical);

          sendProgress(
            {
              type: "tool_summary",
              toolName,
              content,
              requestId: capturedRequestId,
            },
            controller,
          );
          enqueueMessage("tool_summary", JSON.stringify({ toolName: normalizedToolName, content, raw }));
          // Keep naming context lean and human-readable, avoid large raw payloads.
          conversationMessages.push({
            sender: "tool_summary",
            content: `${normalizedToolName}: ${content}`,
          });
        };

        let parrotReply = "";
        let generationStopped = false;
        const persistPendingMessages = async () => {
          const state = await withRequestPersistenceLock(
            capturedChatId,
            capturedRequestId,
            async (tx) => {
              // Atomically commit the final transcript and free the conversation.
              // A worker replaced after expiry must never overwrite its successor.
              if (holder) {
                const owned = await tx.mcpChatLease.deleteMany({ where: { chatId: capturedChatId, holder } });
                if (!owned.count) throw new Error("The chat generation lease has expired.");
              }
              const existingMessages = await tx.chatMessage.findMany({
                where: {
                  chatId: capturedChatId,
                  requestId: capturedRequestId,
                },
                select: { sender: true },
              });
              const existingTerminalState =
                getRequestTerminalState(existingMessages);
              const stopRequested =
                generationStopped || signal.aborted;

              if (
                stopRequested &&
                !pendingMessages.some(
                  (pendingMessage) =>
                    pendingMessage.sender === "system_stopped",
                )
              ) {
                enqueueMessage(
                  "system_stopped",
                  "Response stopped by the user.",
                );
              }

              const messagesToPersist = selectTerminalSafeMessages(
                pendingMessages,
                existingTerminalState,
                stopRequested,
              );

              if (messagesToPersist.length > 0) {
                await tx.chatMessage.createMany({
                  data: messagesToPersist,
                });
                if (messagesToPersist.some(row => row.sender === "parrot")) {
                  await recordChatReply(tx, capturedChatId, capturedRequestId);
                }
                await tx.chatHistory.update({
                  where: { id: capturedChatId },
                  data: { modifiedAt: new Date() },
                });
              }

              return getRequestTerminalState([
                ...existingMessages,
                ...messagesToPersist,
              ]);
            },
          );
          leaseReleased = true;
          return state;
        };

        try {
          sendProgress(
            {
              type: "progress",
              title: "Processing",
              content: "Preparing your response...",
              requestId: capturedRequestId,
            },
            controller
          );
          void isAutoTrigger;

          // Parrot's answer
          try {
            // Build message history with system prompt (Prisma context already injected)
            const parrotHistory = buildParrotHistory(conversationMessages, newParrotSysPrompt);

            // Start streaming LLM response using .stream() API with multiple modes
            const workflow = isMcpGuest ? await getMcpGuestWorkflow() : await getParrotWorkflow();
            const eventStream = await workflow.stream(
              { messages: parrotHistory },
              {
                streamMode: ["updates", "messages", "custom"],
                configurable: {
                  thread_id: capturedChatId,
                  userId: capturedUserId,
                  chatUsage,
                },
                signal,
              }
            );

            for await (const [streamMode, chunk] of eventStream) {
              // Handle custom events from tools
              if (streamMode === "custom") {
                const customData = chunk as { toolName?: string; message?: string; content?: string };

                if (customData?.toolName && customData.message) {
                  toolsWithCustomProgress.add(canonicalToolKey(customData.toolName));
                  // tool_progress event (ephemeral)
                  sendProgress(
                    {
                      type: "tool_progress",
                      toolName: displayToolName(customData.toolName),
                      message: customData.message,
                      requestId: capturedRequestId,
                    },
                    controller
                  );
                } else if (customData?.toolName && customData.content) {
                  const key = canonicalToolKey(customData.toolName);
                  customSummaryByTool.set(key, customData.content);
                } else {
                  console.log("⚠️ Unknown custom event format:", customData);
                }
                continue;
              }

              // Handle messages mode (LLM token streaming)
              if (streamMode === "messages") {
                const [token, metadata] = chunk as MessageStreamChunk;

                // LLM streaming tokens
                const nodeName = metadata.langgraph_node;
                if (nodeName && toolNodesForStream.has(nodeName)) {
                  continue;
                }

                if (token.contentBlocks) {
                  for (const block of token.contentBlocks) {
                    if (typeof block.text === "string") {
                      parrotReply += block.text;
                      sendProgress(
                        {
                          type: "parrot",
                          content: block.text,
                          requestId: capturedRequestId,
                        },
                        controller,
                      );
                    }
                  }
                }
                continue;
              }

              // Handle updates mode (agent progress)
              if (streamMode === "updates") {
                const [step, content] = Object.entries(chunk as Record<string, unknown>)[0];

                // Track when model starts (for "Drafting response" message)
                // Show this message both at the start and after tools complete
                if (step === "model") {
                  if (!hasAnnouncedDrafting) {
                    hasAnnouncedDrafting = true;
                    sendProgress(
                      {
                        type: "progress",
                        title: "Drafting response",
                        content: "Turning insights into a clear answer...",
                        requestId: capturedRequestId,
                      },
                      controller
                    );
                  } else {
                    // Model is called again after tools - show final drafting message
                    sendProgress(
                      {
                        type: "progress",
                        title: "Finalizing response",
                        content: "Synthesizing research into your answer...",
                        requestId: capturedRequestId,
                      },
                      controller
                    );
                  }
                }

                // Track when tools node executes (for "Additional Sources")
                if (step === "tools") {
                  const messages = (content as ToolUpdatePayload)?.messages || [];
                  for (const msg of messages) {
                    const toolName = msg.tool_name || msg.name;
                    if (!toolName) continue;
                    const toolKey = canonicalToolKey(toolName);
                    const readableToolName = displayToolName(toolName);
                    toolNodesForStream.add(toolName);

                    const isSupplemental = toolName === "supplementalArticleSearch";
                    const isCcel = toolName === "ccelRetrieval";

                    // For tools without custom writer events (MCP tools, etc.),
                    // send a generic progress event so the user sees activity
                    if (!isSupplemental && !isCcel && !toolsWithCustomProgress.has(toolKey)) {
                      sendProgress(
                        {
                          type: "tool_progress",
                          toolName: readableToolName,
                          message: `Using ${readableToolName}...`,
                          requestId: capturedRequestId,
                        },
                        controller
                      );
                    }

                    try {
                      const parsed = JSON.parse(msg.content);

                      if (isSupplemental) {
                        const results = parsed?.results;
                        if (Array.isArray(results) && results.length > 0) {
                          const articleLinks = results
                            .filter((r: { url?: string }) => r.url)
                            .map((article: { title?: string; url?: string }) => {
                              const title = article.title || "Untitled Article";
                              const url = article.url!;
                              const domain = url.includes("gotquestions.org") ? "GotQuestions" : "Monergism";
                              return `- [${title}](${url}) _(${domain})_`;
                            })
                            .join("\n");

                          if (articleLinks) {
                            const content = `### Additional Sources\n\n${articleLinks}`;
                            emitToolSummary("Theological Research", content, parsed);
                          }
                        }
                      } else if (isCcel) {
                        const consultedMarkdown: unknown = parsed?.consultedSourcesMarkdown;
                        if (typeof consultedMarkdown === "string" && consultedMarkdown.trim().length > 0) {
                          const content = `### CCEL Sources\n\n${consultedMarkdown.trim()}`;
                          emitToolSummary("CCEL Retrieval", content, parsed);
                        }
                      } else {
                        const customSummary = customSummaryByTool.get(toolKey) || customSummaryByTool.get(canonicalToolKey(readableToolName));
                        const summary = customSummary || summarizeGenericToolOutput(readableToolName, parsed);
                        emitToolSummary(readableToolName, summary, parsed);
                      }
                    } catch {
                      const customSummary = customSummaryByTool.get(toolKey) || customSummaryByTool.get(canonicalToolKey(readableToolName));
                      const summary = customSummary || summarizeGenericToolOutput(readableToolName, msg.content);
                      emitToolSummary(readableToolName, summary, msg.content);
                    }
                  }
                }
                continue;
              }
            }

            // After streaming completes, save the full conversation
            if (parrotReply.trim()) {
              enqueueMessage("parrot", parrotReply);
              conversationMessages.push({
                sender: "parrot",
                content: parrotReply,
              });
            }
          } catch (error) {
            generationStopped =
              signal.aborted ||
              (error instanceof Error && error.name === "AbortError");
            if (generationStopped) {
              enqueueMessage("system_stopped", "Response stopped by the user.");
            } else {
              const failureMessage = "We couldn't finish this response.";
              enqueueMessage("system_error", failureMessage);
              sendError(
                error,
                "parrot_response",
                controller,
                capturedRequestId,
              );
            }
          }

          // Stop and completion use the same transaction-scoped lock. Whichever
          // terminal state commits first becomes authoritative for this request.
          let persistedTerminalState: RequestTerminalState = "open";
          try {
            persistedTerminalState = await persistPendingMessages();
          } catch {
            // One short retry for transient DB pressure (e.g. P2028 timeout).
            try {
              await wait(300);
              persistedTerminalState = await persistPendingMessages();
            } catch (retryError) {
              sendError(
                retryError,
                "persist_messages",
                controller,
                capturedRequestId,
              );
            }
          }
          if (persistedTerminalState === "stopped") {
            generationStopped = true;
          }

          // Handle conversation naming BEFORE closing stream so client can update sidebar
          // This runs inline (not fire-and-forget) to ensure the event reaches the client
          try {
            const currentChat = await prisma.chatHistory.findUnique({
              where: { id: capturedChatId },
              select: { conversationName: true },
            });

            if (
              !isMcpGuest &&
              persistedTerminalState === "completed" &&
              parrotReply.trim() &&
              currentChat &&
              currentChat.conversationName === "New Conversation"
            ) {
              const allMessagesStr = conversationMessages.map((m) => `${m.sender}: ${m.content}`).join("\n");
              const conversationName = await generateConversationName(allMessagesStr, chatUsage);
              const finalName = conversationName || "New Conversation";

              await prisma.chatHistory.update({
                where: { id: capturedChatId },
                data: { conversationName: finalName },
              });

              // Send name update event so client can update sidebar immediately
              sendProgress(
                {
                  type: "conversationNameUpdated",
                  chatId: capturedChatId,
                  name: finalName,
                  requestId: capturedRequestId,
                },
                controller
              );
            }
          } catch (error) {
            console.error("Conversation naming failed:", error);
            // Non-fatal: continue to close stream even if naming fails
          }

          // Keep the request alive for memory extraction and its usage receipt after streaming.
          if (
            !isMcpGuest &&
            persistedTerminalState === "completed" &&
            capturedUserId &&
            parrotReply.trim()
          ) {
            after(async () => {
              try {
                await updateUserMemoriesFromConversation(capturedUserId, conversationMessages, chatUsage);
              } catch (error) {
                console.error("Background memory extraction failed:", error);
              }
            });
          } else if (
            persistedTerminalState === "completed" &&
            !capturedUserId
          ) {
            console.warn("⚠️ Memory extraction skipped: userId is undefined");
          }

          // Send "done" and close stream
          if (!generationStopped && !signal.aborted) {
            sendProgress(
              {
                type: "done",
                requestId: capturedRequestId,
              },
              controller,
            );
          }
        } catch (error) {
          if (!signal.aborted) {
            enqueueMessage("system_error", "We couldn't finish this response.");
            if (pendingMessages.length > 0) {
              await persistPendingMessages().catch((persistError) => {
                console.error(
                  "Failed to persist request failure:",
                  persistError,
                );
              });
            }
            sendError(error, "general", controller, capturedRequestId);
          }
        } finally {
          await releaseLease();
          try {
            controller.close();
          } catch {
            // The client may already have closed the stream after Stop.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function executeGetChat(
  chatId: string | null,
  options: { legacyShape?: boolean; website?: boolean } = {},
) {
  const actor = await resolveChatActor();
  const requesterUserId = getChatActorId(actor);

  if (browserGuestCannotAccess(actor, chatId)) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (!chatId) {
    return NextResponse.json({ error: "Missing chatId" }, { status: 400 });
  }

  const chat = await prisma.chatHistory.findUnique({ where: { id: chatId } });
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (chat.userId !== requesterUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [profile, messages] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { appwriteUserId: chat.userId },
      select: { denomination: true },
    }),
    prisma.chatMessage.findMany({
      where: { chatId },
      select: { id: true, chatId: true, requestId: true, sender: true, content: true, timestamp: true },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    }),
  ]);
  const effectiveDenomination = resolveEffectiveDenomination(
    profile?.denomination,
    chat.denomination,
  );

  // Parse tool_summary messages from JSON strings
  const parsedMessages = messages.map((msg) => {
    if (msg.sender === "tool_summary") {
      try {
        const parsed = JSON.parse(msg.content);
        return {
          ...msg,
          toolName: parsed.toolName,
          content: parsed.content,
        };
      } catch (e) {
        console.error("Failed to parse tool_summary message:", e);
        return msg;
      }
    }
    if (msg.sender === "gotQuestions") {
      return {
        ...msg,
        sender: "tool_summary",
        toolName: "Theological Research",
        ...(options.legacyShape ? { raw: null } : {}),
      };
    }
    if (msg.sender === "CCEL") {
      return {
        ...msg,
        sender: "tool_summary",
        toolName: "CCEL Retrieval",
        ...(options.legacyShape ? { raw: null } : {}),
      };
    }
    if (!options.legacyShape && msg.sender === "calvin") {
      return { ...msg, sender: "parrot" };
    }
    return msg;
  });

  const publicChat = {
    id: chat.id,
    conversationName: chat.conversationName,
    createdAt: chat.createdAt.toISOString(),
    modifiedAt: chat.modifiedAt.toISOString(),
    category: chat.category,
    subcategory: chat.subcategory,
    ...(options.legacyShape
      ? { issue_type: chat.issue_type, userId: chat.userId }
      : { issueType: chat.issue_type }),
    denomination: chat.denomination,
    effectiveDenomination,
  };

  const responseBody = {
    chat: publicChat,
    messages: parsedMessages.map((message) => ({
      ...message,
      requestId: message.requestId ?? null,
      timestamp: message.timestamp.toISOString(),
    })),
  };
  const responseSchema = options.legacyShape
    ? legacyGetChatResponseSchema
    : getChatResponseSchema;
  const parsedResponse = responseSchema.safeParse(responseBody);
  if (!parsedResponse.success) {
    console.error(
      "Chat history response failed contract validation",
      parsedResponse.error,
    );
    return NextResponse.json(
      { error: "Internal response validation failed" },
      { status: 500 },
    );
  }

  const response = NextResponse.json(parsedResponse.data);
  if (options.website && messages.some(row => row.sender === "parrot" && row.requestId)) {
    const operation = await pendingVisibleReply(chatId, prisma).catch(() => undefined);
    if (!operation) return response;
    const reply = messages.find(row =>
      row.sender === "parrot" && row.requestId && chatOperationId(chatId, row.requestId) === operation);
    if (reply) {
      // The website only observes this one persisted reply, even on a long transcript.
      response.headers.set("x-parrot-reply-target", encodeURIComponent(reply.id));
      response.headers.set("x-parrot-reply-operation", operation);
    }
  }
  return response;
}

export async function handleLegacyChatPost(
  request: Request,
  execute: ChatExecutor = executeChatCommand,
) {
  recordLegacyApiUse(request, "/api/parrot-chat");

  const parsed = await parseJsonRequest(request, legacyParrotChatRequestSchema);
  if (!parsed.success) {
    return withHeaders(parsed.response, LEGACY_API_HEADERS);
  }

  let command: ChatCommand;
  if ("stop" in parsed.data) {
    command = {
      chatId: parsed.data.chatId,
      requestId: parsed.data.requestId,
      stop: true,
    };
  } else if ("message" in parsed.data) {
    command = {
      chatId: parsed.data.chatId,
      message: parsed.data.message,
      denomination: parsed.data.denomination,
      requestId: parsed.data.requestId,
      messageId: parsed.data.messageId,
      isAutoTrigger: parsed.data.isAutoTrigger,
      retry: parsed.data.retry,
    };
  } else {
    command = {
      initialQuestion: parsed.data.initialQuestion,
      initialAnswer: parsed.data.initialAnswer,
      category: parsed.data.category,
      subcategory: parsed.data.subcategory,
      issueType: parsed.data.issue_type,
      denomination: parsed.data.denomination,
      clientChatId: parsed.data.clientChatId,
      requestId: parsed.data.requestId,
    };
  }

  return executeLegacySafely(() => execute(request, command));
}

export async function handleLegacyChatGet(
  request: Request,
  execute: GetChatExecutor = executeGetChat,
) {
  recordLegacyApiUse(request, "/api/parrot-chat");

  const { searchParams } = new URL(request.url);
  const parsed = legacyGetChatQuerySchema.safeParse({
    chatId: searchParams.get("chatId"),
  });
  if (!parsed.success) {
    return withHeaders(
      NextResponse.json({ error: "Invalid request" }, { status: 400 }),
      LEGACY_API_HEADERS,
    );
  }

  return executeLegacySafely(() =>
    execute(parsed.data.chatId, {
      legacyShape: true,
    }),
  );
}

export async function handleCreateChat(
  request: Request,
  execute: ChatExecutor = (req, command) => executeChatCommand(req, command, "public_api"),
) {
  const parsed = await parseJsonRequest(request, createChatRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const response = await executeV1Safely(() =>
    execute(request, {
      initialQuestion: parsed.data.initialQuestion,
      initialAnswer: parsed.data.initialAnswer,
      category: parsed.data.category,
      subcategory: parsed.data.subcategory,
      issueType: parsed.data.issueType,
      denomination: parsed.data.denomination,
      clientChatId: parsed.data.clientChatId,
      requestId: parsed.data.requestId,
    }),
  );
  return validateJsonResponse(response, createChatResponseSchema, 201);
}

export async function handleGetChat(
  chatId: string,
  execute: GetChatExecutor = executeGetChat,
) {
  const parsed = getChatParamsSchema.safeParse({ chatId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  return executeV1Safely(() => execute(parsed.data.chatId));
}

export async function handleSendChatMessage(
  request: Request,
  chatId: string,
  execute: ChatExecutor = (req, command) => executeChatCommand(req, command, "public_api"),
) {
  const parsedParams = getChatParamsSchema.safeParse({ chatId });
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = await parseJsonRequest(request, sendChatMessageRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  return executeV1Safely(() =>
    execute(request, {
      chatId: parsedParams.data.chatId,
      message: parsed.data.message,
      requestId: parsed.data.requestId,
      messageId: parsed.data.messageId,
      isAutoTrigger: parsed.data.isAutoTrigger,
      retry: parsed.data.retry,
    }),
  );
}

export async function handleStopChatRequest(
  request: Request,
  chatId: string,
  requestId: string,
  execute: ChatExecutor = executeChatCommand,
) {
  const parsedParams = stopChatParamsSchema.safeParse({ chatId, requestId });
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const rawBody = await request.text();
  let payload: unknown = {};
  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  }
  const parsed = stopChatRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const response = await executeV1Safely(() =>
    execute(request, {
      chatId: parsedParams.data.chatId,
      requestId: parsedParams.data.requestId,
      stop: true,
    }),
  );
  return validateJsonResponse(response, stopChatResponseSchema);
}
