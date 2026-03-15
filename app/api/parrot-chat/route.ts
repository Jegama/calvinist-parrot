// app/api/parrot-chat/route.ts

// export const maxDuration = 60;

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { sendError, sendProgress } from "@/lib/progressUtils";
import prisma from "@/lib/prisma";
import { SystemMessage, HumanMessage, AIMessage } from "langchain";
import { getParrotWorkflow } from "@/utils/langChainAgents/mainAgent";
import { toolsArray } from "@/utils/langChainAgents/tools";
import { generateConversationName } from "@/utils/generateConversationName";
import { updateUserMemoriesFromConversation } from "@/utils/memoryExtraction";
import { buildParrotSystemPrompt } from "@/utils/buildParrotSystemPrompt";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function POST(request: Request) {
  const TOOL_NODE_NAMES = new Set(["tools", ...toolsArray.map((tool) => tool.name)]);

  interface ChatRequestBody {
    userId: string;
    chatId?: string;
    message?: string;
    initialQuestion?: string;
    initialAnswer?: string;
    category?: string;
    subcategory?: string;
    issue_type?: string;
    denomination?: string;
    isAutoTrigger?: boolean;
    clientChatId?: string;
  }

  const {
    userId,
    chatId,
    message,
    initialQuestion,
    initialAnswer,
    category,
    subcategory,
    issue_type,
    denomination = "reformed-baptist",
    isAutoTrigger,
    clientChatId,
  }: ChatRequestBody = await request.json();

  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const effectiveUserId = authenticatedUserId;

  // Handle new chat from Parrot QA
  if (effectiveUserId && initialQuestion && initialAnswer && !chatId) {
    const allMessagesStr = `user: ${initialQuestion}\nparrot: ${initialAnswer}`;
    const conversationName = await generateConversationName(allMessagesStr);
    const chat = await prisma.$transaction(async (tx) => {
      const createdChat = await tx.chatHistory.create({
        data: {
          userId: effectiveUserId,
          conversationName,
          category: category || "",
          subcategory: subcategory || "",
          issue_type: issue_type || "",
        },
      });

      await tx.chatMessage.create({
        data: {
          chatId: createdChat.id,
          sender: "user",
          content: initialQuestion,
        },
      });

      await tx.chatMessage.create({
        data: {
          chatId: createdChat.id,
          sender: "parrot",
          content: initialAnswer,
        },
      });

      return createdChat;
    });

    return NextResponse.json({ chatId: chat.id });
  }

  // If userId and initial message are provided but no chatId, start a new chat session. This is from `app/page.tsx`.
  if (effectiveUserId && initialQuestion && !chatId) {
    const chat = await prisma.$transaction(async (tx) => {
      const createdChat = await tx.chatHistory.create({
        data: {
          id: clientChatId ?? undefined,
          userId: effectiveUserId,
          conversationName: "New Conversation",
          category: "",
          subcategory: "",
          issue_type: "",
          denomination,
        },
      });

      await tx.chatMessage.create({
        data: {
          chatId: createdChat.id,
          sender: "user",
          content: initialQuestion,
        },
      });

      return createdChat;
    });

    return NextResponse.json({ chatId: chat.id });
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

    if (chatRecord.userId !== authenticatedUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    // TTFT Optimization: Fetch user profile and chat messages in parallel
    // This eliminates one sequential DB round-trip (~100-300ms savings)
    type ChatMessageSummary = { sender: string; content: string };
    const [userProfile, previousMessages] = await Promise.all([
      prisma.userProfile.findUnique({
        where: { appwriteUserId: resolvedUserId },
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
        orderBy: { timestamp: "asc" },
        select: { sender: true, content: true },
      }) as Promise<ChatMessageSummary[]>,
    ]);

    // Build system prompt with pastoral context & denomination mapping
    const newParrotSysPrompt = buildParrotSystemPrompt({
      userProfile,
      denominationFallback: resolvedDenomination,
      effectiveUserId: resolvedUserId,
    });

    // Capture variables for stream closure
    const capturedUserId = resolvedUserId;
    const capturedChatId = chatId;

    const stream = new ReadableStream({
      async start(controller) {
        // TTFT Optimization: Send immediate progress event before any async work
        // This gives the user instant visual feedback while we prepare the LLM call
        sendProgress(
          {
            type: "progress",
            title: "Processing",
            content: "Preparing your response...",
          },
          controller
        );

        // Message accumulator - initialized from pre-fetched data
        const conversationMessages: { sender: string; content: string }[] = previousMessages.map((msg: ChatMessageSummary) => ({
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

          sendProgress({ type: "tool_summary", toolName, content, raw }, controller);
          enqueueMessage("tool_summary", JSON.stringify({ toolName: normalizedToolName, content, raw }));
          // Keep naming context lean and human-readable, avoid large raw payloads.
          conversationMessages.push({
            sender: "tool_summary",
            content: `${normalizedToolName}: ${content}`,
          });
        };

        try {

          // Only add and save user message if not auto-triggered. This is from `app/[chatId]/page.tsx`, when you load the page and the last message is from the user.
          if (!isAutoTrigger) {
            const userMessage = { sender: "user", content: message };
            conversationMessages.push(userMessage);
            enqueueMessage("user", message);
          }

          // Parrot's answer
          let parrotReply = "";
          try {
            // Build message history with system prompt (Prisma context already injected)
            const parrotHistory = buildParrotHistory(conversationMessages, newParrotSysPrompt);

            // Start streaming LLM response using .stream() API with multiple modes
            const workflow = await getParrotWorkflow();
            const eventStream = await workflow.stream(
              { messages: parrotHistory },
              {
                streamMode: ["updates", "messages", "custom"],
                configurable: {
                  thread_id: capturedChatId,
                  userId: capturedUserId,
                },
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
                    { type: "tool_progress", toolName: displayToolName(customData.toolName), message: customData.message },
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
                      sendProgress({ type: "parrot", content: block.text }, controller);
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
                        { type: "tool_progress", toolName: readableToolName, message: `Using ${readableToolName}...` },
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
            sendError(error, "parrot_response", controller);
          }

          // Persist messages to database (without conversation naming - that's deferred)
          if (pendingMessages.length > 0) {
            try {
              await prisma.chatMessage.createMany({
                data: pendingMessages,
              });
              await prisma.chatHistory.update({
                where: { id: capturedChatId },
                data: { modifiedAt: new Date() },
              });
            } catch {
              // One short retry for transient DB pressure (e.g. P2028 timeout).
              try {
                await wait(300);
                await prisma.chatMessage.createMany({
                  data: pendingMessages,
                });
                await prisma.chatHistory.update({
                  where: { id: capturedChatId },
                  data: { modifiedAt: new Date() },
                });
              } catch (retryError) {
                sendError(retryError, "persist_messages", controller);
              }
            }
          }

          // Handle conversation naming BEFORE closing stream so client can update sidebar
          // This runs inline (not fire-and-forget) to ensure the event reaches the client
          try {
            const currentChat = await prisma.chatHistory.findUnique({
              where: { id: capturedChatId },
              select: { conversationName: true },
            });

            if (currentChat && currentChat.conversationName === "New Conversation") {
              const allMessagesStr = conversationMessages.map((m) => `${m.sender}: ${m.content}`).join("\n");
              const conversationName = await generateConversationName(allMessagesStr);
              const finalName = conversationName || "New Conversation";

              await prisma.chatHistory.update({
                where: { id: capturedChatId },
                data: { conversationName: finalName },
              });

              // Send name update event so client can update sidebar immediately
              sendProgress(
                { type: "conversationNameUpdated", chatId: capturedChatId, name: finalName },
                controller
              );
            }
          } catch (error) {
            console.error("Conversation naming failed:", error);
            // Non-fatal: continue to close stream even if naming fails
          }

          // Send "done" and close stream
          sendProgress({ type: "done" }, controller);
          controller.close();

          // === Background tasks (fire-and-forget, don't block response) ===
          // Memory extraction runs after stream closes since client doesn't need this data

          // 2. Extract and update user memories asynchronously
          if (capturedUserId) {
            updateUserMemoriesFromConversation(
              capturedUserId,
              conversationMessages.map((m) => ({
                sender: m.sender,
                content: m.content,
              }))
            ).catch((error) => {
              console.error("Background memory extraction failed:", error);
            });
          } else {
            console.warn("⚠️ Memory extraction skipped: userId is undefined");
          }
        } catch (error) {
          sendError(error, "general", controller);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");
  const userIdFromQuery = searchParams.get("userId") ?? undefined;
  const { userId: requesterUserId, errorResponse } = await requireAuthenticatedUser(userIdFromQuery);
  if (errorResponse || !requesterUserId) return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const messages = await prisma.chatMessage.findMany({
    where: { chatId },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
  });

  // Parse tool_summary messages from JSON strings
  const parsedMessages = messages.map((msg) => {
    if (msg.sender === "tool_summary") {
      try {
        const parsed = JSON.parse(msg.content);
        return {
          ...msg,
          toolName: parsed.toolName,
          content: parsed.content,
          raw: parsed.raw,
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
        raw: null,
      };
    }
    if (msg.sender === "CCEL") {
      return {
        ...msg,
        sender: "tool_summary",
        toolName: "CCEL Retrieval",
        raw: null,
      };
    }
    return msg;
  });

  return NextResponse.json({ chat, messages: parsedMessages });
}
