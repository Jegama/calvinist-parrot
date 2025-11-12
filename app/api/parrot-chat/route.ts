// app/api/parrot-chat/route.ts

export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { sendError, sendProgress } from '@/lib/progressUtils';
import prisma from '@/lib/prisma';
import * as prompts from '@/lib/prompts/core';
import { SystemMessage, HumanMessage, AIMessage } from 'langchain';
import { parrotWorkflow } from '@/utils/langChainAgents/mainAgent';
import { generateConversationName } from '@/utils/generateConversationName';
import { updateUserMemoriesFromConversation } from '@/utils/memoryExtraction';
import { getMemoryStore, MemoryNamespaces, MemoryKeys } from '@/lib/langGraphStore';

export async function POST(request: Request) {
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

  // Handle new chat from Parrot QA
  if (userId && initialQuestion && initialAnswer && !chatId) {
    const allMessagesStr = `user: ${initialQuestion}\nparrot: ${initialAnswer}`;
    const conversationName = await generateConversationName(allMessagesStr);
    const chat = await prisma.$transaction(async (tx) => {
      const createdChat = await tx.chatHistory.create({
        data: {
          userId,
          conversationName,
          category: category || '',
          subcategory: subcategory || '',
          issue_type: issue_type || '',
        },
      });

      await tx.chatMessage.create({
        data: { chatId: createdChat.id, sender: 'user', content: initialQuestion },
      });

      await tx.chatMessage.create({
        data: { chatId: createdChat.id, sender: 'parrot', content: initialAnswer },
      });

      return createdChat;
    });

    return NextResponse.json({ chatId: chat.id });
  }

  // If userId and initial message are provided but no chatId, start a new chat session. This is from `app/page.tsx`.
  if (userId && initialQuestion && !chatId) {
    const chat = await prisma.$transaction(async (tx) => {
      const createdChat = await tx.chatHistory.create({
        data: {
          id: clientChatId ?? undefined,
          userId,
          conversationName: 'New Conversation',
          category: '',
          subcategory: '',
          issue_type: '',
          denomination,
        },
      });

      await tx.chatMessage.create({
        data: { chatId: createdChat.id, sender: 'user', content: initialQuestion },
      });

      return createdChat;
    });

    return NextResponse.json({ chatId: chat.id });
  }

  // If chatID and message run main system <-- This continues the converation and is the main use case.
  if (chatId && message) {
    // Fetch userId from chatHistory if not provided in request
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const chatRecord = await prisma.chatHistory.findUnique({
        where: { id: chatId },
        select: { userId: true }
      });
      effectiveUserId = chatRecord?.userId || '';
    }

    const mapDenominationPrompt = (value: string) => {
      switch (value) {
        case "reformed-baptist":
          return prompts.secondary_reformed_baptist;
        case "presbyterian":
          return prompts.secondary_presbyterian;
        case "wesleyan":
          return prompts.secondary_wesleyan;
        case "lutheran":
          return prompts.secondary_lutheran;
        case "anglican":
          return prompts.secondary_anglican;
        case "pentecostal":
          return prompts.secondary_pentecostal;
        case "non-denom":
          return prompts.secondary_non_denom;
        default:
          return prompts.secondary_reformed_baptist;
      }
    };

    type LangChainMessage =
      | InstanceType<typeof SystemMessage>
      | InstanceType<typeof HumanMessage>
      | InstanceType<typeof AIMessage>;

    const buildParrotHistory: (
      messages: { sender: string; content: string }[],
      parrotSysPrompt: string
    ) => LangChainMessage[] = (messages, parrotSysPrompt) => {
      const history: LangChainMessage[] = [
        new SystemMessage(parrotSysPrompt),
      ];
      for (const msg of messages) {
        if (msg.sender === 'user') {
          history.push(new HumanMessage(msg.content));
        } else if (msg.sender === 'parrot') {
          history.push(new AIMessage(msg.content));
        }
      }
      return history;
    };

    // Fetch user profile for pastoral context injection
    const userProfile = await prisma.userProfile.findUnique({
      where: { appwriteUserId: effectiveUserId },
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
    });

    // Build pastoral context from Prisma data
    const buildPastoralContext = (): string => {
      if (!userProfile) {
        return '# Pastoral Context\n(No user profile data available yet. User preferences will be learned over time.)';
      }

      const lines: string[] = ['# Pastoral Context'];
      lines.push('Use this structured data to inform your pastoral approach silently (NEVER mention these details explicitly to the user):');
      lines.push('');

      // Denomination (user-controlled preference)
      if (userProfile.denomination) {
        lines.push(`- **User's Theological Tradition**: ${userProfile.denomination} (apply appropriate secondary doctrine framework)`);
      }

      // Spiritual Status (PRIVATE - for agent's internal use only)
      if (userProfile.spiritualStatus) {
        const statusMap: Record<string, string> = {
          seeker: 'Exploring faith (emphasize Gospel clarity, avoid jargon)',
          new_believer: 'Recently saved (gentle discipleship, foundational truths)',
          growing_believer: 'Established in faith (balanced teaching, application focus)',
          mature_believer: 'Spiritually mature (deeper doctrine, ministry application)',
        };
        lines.push(`- **Spiritual Maturity** (PRIVATE): ${statusMap[userProfile.spiritualStatus] || userProfile.spiritualStatus}`);
      }

      // Gospel Engagement
      if (userProfile.gospelPresentationCount !== null && userProfile.gospelPresentationCount > 0) {
        lines.push(`- **Gospel Presentations Received**: ${userProfile.gospelPresentationCount} time(s) — avoid redundant Gospel explanations unless specifically asked`);
      }

      // Ministry Context
      if (userProfile.ministryContext && userProfile.ministryContext.length > 0) {
        lines.push(`- **Ministry Roles**: ${userProfile.ministryContext.join(', ')} — tailor examples and applications to these contexts`);
      }

      // Church Involvement
      if (userProfile.churchInvolvement) {
        lines.push(`- **Church Involvement**: ${userProfile.churchInvolvement}`);
      }

      // Learning Preferences
      if (userProfile.preferredDepth) {
        const depthMap: Record<string, string> = {
          concise: 'Prefers brief, focused answers (60-100 words)',
          moderate: 'Comfortable with moderate detail (3-5 paragraphs)',
          detailed: 'Appreciates thorough explanations and outlines',
        };
        lines.push(`- **Preferred Answer Depth**: ${depthMap[userProfile.preferredDepth] || userProfile.preferredDepth}`);
      }

      if (userProfile.followUpTendency) {
        lines.push(`- **Follow-Up Style**: ${userProfile.followUpTendency === 'high' ? 'Frequently asks follow-ups' : userProfile.followUpTendency === 'low' ? 'Prefers standalone answers' : 'Moderate follow-up engagement'}`);
      }

      // Doctrinal Question History
      const coreQ = userProfile.coreDoctrineQuestions || 0;
      const secondaryQ = userProfile.secondaryDoctrineQuestions || 0;
      const tertiaryQ = userProfile.tertiaryDoctrineQuestions || 0;
      if (coreQ + secondaryQ + tertiaryQ > 0) {
        lines.push(`- **Doctrinal Question History**: ${coreQ} core, ${secondaryQ} secondary, ${tertiaryQ} tertiary — ${coreQ > 3 ? 'needs clarity on essentials' : 'solid foundation in essentials'}; ${secondaryQ > 5 ? 'exploring denominational distinctives' : ''}; ${tertiaryQ > 5 ? 'interested in disputable matters' : ''}`);
      }

      lines.push('');
      lines.push('**Remember**: Use this context to shape your tone, depth, examples, and doctrinal emphasis. Do NOT explicitly reference this data in your response (e.g., never say "I see you\'re a new believer" or "Based on your spiritual status").');

      return lines.join('\n');
    };

    const pastoralContext = buildPastoralContext();

    // Use profile denomination if available, fallback to request parameter for backward compatibility
    const effectiveDenomination = userProfile?.denomination || denomination;
    const secondaryPromptText = mapDenominationPrompt(effectiveDenomination);
    const coreSysPromptWithDenomination = prompts.CORE_SYS_PROMPT.replace('{denomination}', secondaryPromptText);
    let newParrotSysPrompt = prompts.PARROT_SYS_PROMPT_MAIN.replace('{CORE}', coreSysPromptWithDenomination);
    newParrotSysPrompt = newParrotSysPrompt.replace('{PASTORAL_CONTEXT}', pastoralContext);

    // Capture variables for stream closure
    const capturedUserId = effectiveUserId;
    const capturedChatId = chatId;

    const stream = new ReadableStream({
      async start(controller) {
        // Message accumulator to avoid repeated DB fetches
        let conversationMessages: { sender: string; content: string }[] = [];
        let hasAnnouncedThinking = false;
        let hasAnnouncedDrafting = false;
        const activeToolRuns = new Set<string>();
        const pendingWrites: Prisma.PrismaPromise<unknown>[] = [];

        const toolNameMap: Record<string, { title: string; start: string; finish: string }> = {
          supplementalArticleSearch: {
            title: 'Consulting trusted resources',
            start: 'Looking up supplemental articles to support the answer.',
            finish: 'Finished gathering supporting articles.',
          },
        };

        const getFriendlyToolMessage = (
          toolName?: string
        ): { title: string; start: string; finish: string } => {
          if (!toolName) {
            return {
              title: 'Using a tool',
              start: 'Exploring an external resource for more insight.',
              finish: 'Done consulting the external resource.',
            };
          }
          return toolNameMap[toolName] ?? {
            title: `Using ${toolName}`,
            start: 'Exploring an external resource for more insight.',
            finish: 'Done consulting the external resource.',
          };
        };

        const extractToolName = (payload: unknown): string | undefined => {
          if (!payload || typeof payload !== 'object') {
            return undefined;
          }
          const withName = payload as { name?: unknown; serialized?: { name?: unknown } };
          if (typeof withName.name === 'string' && withName.name.length > 0) {
            return withName.name;
          }
          if (
            withName.serialized &&
            typeof withName.serialized === 'object' &&
            withName.serialized !== null &&
            typeof (withName.serialized as { name?: unknown }).name === 'string'
          ) {
            return (withName.serialized as { name: string }).name;
          }
          return undefined;
        };

        try {
          sendProgress({
            type: 'progress',
            title: 'Preparing context',
            content: 'Gathering conversation history...',
          }, controller);

          // Fetch initial messages only once
          type ChatMessageSummary = { sender: string; content: string };
          const previousMessages: ChatMessageSummary[] = await prisma.chatMessage.findMany({
            where: { chatId: capturedChatId },
            orderBy: { timestamp: 'asc' },
            select: { sender: true, content: true },
          });

          conversationMessages = previousMessages.map((msg: ChatMessageSummary) => ({
            sender: msg.sender,
            content: msg.content,
          }));

          sendProgress({
            type: 'progress',
            title: 'Analyzing question',
            content: 'Context collected — thinking through the best response.',
          }, controller);

          // Only add and save user message if not auto-triggered. This is from `app/[chatId]/page.tsx`, when you load the page and the last message is from the user.
          if (!isAutoTrigger) {
            const userMessage = { sender: 'user', content: message };
            conversationMessages.push(userMessage);
            pendingWrites.push(
              prisma.chatMessage.create({
                data: { chatId: capturedChatId, sender: 'user', content: message },
              })
            );

            sendProgress({
              type: 'progress',
              title: 'Message received',
              content: 'Working on a thoughtful reply...',
            }, controller);
          }

          // Parrot's answer
          let parrotReply = '';
          try {
            // Build message history with system prompt (Prisma context already injected)
            const parrotHistory = buildParrotHistory(
              conversationMessages,
              newParrotSysPrompt
            );

            // Start streaming LLM response
            const eventStream = parrotWorkflow.streamEvents(
              { messages: parrotHistory },
              { version: "v2", streamMode: ["updates", "messages"], configurable: { thread_id: capturedChatId, userId: capturedUserId } }
            );

            for await (const { event, tags, data } of eventStream) {
              if (event === "on_chat_model_stream") {
                // data.chunk is the partial token chunk for the LLM's AIMessage
                if (data.chunk?.content) {
                  parrotReply += data.chunk.content;
                  sendProgress({ type: 'parrot', content: data.chunk.content }, controller);
                }
              } else if (event === "on_chat_model_start") {
                if (!hasAnnouncedDrafting) {
                  hasAnnouncedDrafting = true;
                  sendProgress({
                    type: 'progress',
                    title: 'Drafting response',
                    content: 'Turning insights into a clear answer...',
                  }, controller);
                }
              } else if (event === "on_chain_start") {
                // New progress handling using data.input.messages
                if (!hasAnnouncedThinking) {
                  hasAnnouncedThinking = true;
                  sendProgress({
                    type: 'progress',
                    title: 'Mapping out a plan',
                    content: 'Considering sources and next steps...',
                  }, controller);
                }

                if (data.input?.messages?.length > 0) {
                  const messageWithToolCall = data.input.messages.find(
                    (m: { tool_calls?: Array<{ args?: Record<string, unknown> }> }) =>
                      Array.isArray(m.tool_calls) && m.tool_calls.length > 0
                  );

                  const firstToolCall = messageWithToolCall?.tool_calls?.[0];
                  if (firstToolCall) {
                    const args = firstToolCall.args ?? {};
                    if (typeof args.query === 'string' && args.query.trim()) {
                      const friendly = getFriendlyToolMessage(firstToolCall.name);
                      sendProgress({
                        type: 'progress',
                        title: friendly.title,
                        content: args.query,
                      }, controller);
                    } else if (typeof args.draft === 'string' && args.draft.trim()) {
                      sendProgress({
                        type: 'progress',
                        title: 'Requesting peer review',
                        content: args.draft.slice(0, 120),
                      }, controller);
                    } else if (args.passages) {
                      try {
                        const passages = Array.isArray(args.passages)
                          ? args.passages
                          : JSON.parse(String(args.passages));
                        const list = Array.isArray(passages) ? passages.join(', ') : String(passages);
                        sendProgress({
                          type: 'progress',
                          title: 'Reviewing commentary passages',
                          content: list,
                        }, controller);
                      } catch (e) {
                        sendProgress({
                          type: 'progress',
                          title: 'Reviewing commentary passages',
                          content: String(args.passages),
                        }, controller);
                        console.error("Failed to parse passages", e);
                      }
                    }
                  }
                }
              } else if (event === "on_tool_start") {
                const toolName = extractToolName(data);
                const friendly = getFriendlyToolMessage(toolName);
                if (!activeToolRuns.has(toolName ?? 'unknown')) {
                  activeToolRuns.add(toolName ?? 'unknown');
                  sendProgress({
                    type: 'progress',
                    title: friendly.title,
                    content: friendly.start,
                  }, controller);
                }
              } else if (event === "on_tool_end") {
                console.log("Tool end:", data.output.name);
                console.log(tags);
                if (data.output.name === "supplementalArticleSearch") {
                  // Parse the JSON content from the tool's output
                  let toolOutput;
                  try {
                    toolOutput = JSON.parse(data.output.content);
                  } catch (e) {
                    console.error("Failed to parse supplementalArticleSearch output", e);
                    console.error("Raw content:", data.output.content);
                    return;
                  }
                  // Check for error in the tool response
                  if (toolOutput.error) {
                    console.error("supplementalArticleSearch returned error:", toolOutput.error);
                    return;
                  }
                  // Ensure results exist
                  const results = toolOutput.results;
                  if (results && results.length > 0) {
                    // Create a markdown-formatted bibliography list
                    const parsedReferences = results
                      .map((result: { title: string; url: string }) => `* [${result.title}](${result.url})`)
                      .join('\n');
                    // Pass the formatted bibliography to the front-end
                    sendProgress({ type: 'gotQuestions', content: parsedReferences }, controller);
                    const friendly = getFriendlyToolMessage(data.output.name);
                    sendProgress({
                      type: 'progress',
                      title: friendly.title,
                      content: friendly.finish,
                    }, controller);
                    await prisma.chatMessage.create({
                      data: { chatId: capturedChatId, sender: 'gotQuestions', content: parsedReferences },
                    });
                    sendProgress({
                      type: 'progress',
                      title: 'Synthesizing answer',
                      content: 'Weaving research into a cohesive response...',
                    }, controller);
                  }
                }
              } else if (event === "on_chain_end") {
                if (activeToolRuns.size > 0) {
                  activeToolRuns.clear();
                }
              } // else {
              // console.log("Unhandled event:", event);
              // }
            }

            // When finished, store parrotReply in DB, etc.
            pendingWrites.push(
              prisma.chatMessage.create({
                data: { chatId: capturedChatId, sender: 'parrot', content: parrotReply },
              })
            );
            conversationMessages.push({ sender: 'parrot', content: parrotReply });
            sendProgress({
              type: 'progress',
              title: 'Final polishing',
              content: 'Answer ready — sending it your way...',
            }, controller);

          } catch (error) {
            sendError(error, 'parrot_response', controller);
          }

          // Fetch current chat metadata (for naming and memory extraction)
          let currentChat: Awaited<ReturnType<typeof prisma.chatHistory.findUnique>> = null;
          try {
            currentChat = await prisma.chatHistory.findUnique({ where: { id: capturedChatId } });
          } catch (error) {
            console.error('Error fetching chat metadata:', error);
          }

          // Handle conversation naming
          try {
            if (currentChat && currentChat.conversationName === 'New Conversation') {
              const allMessagesStr = conversationMessages.map((m) => `${m.sender}: ${m.content}`).join('\n');
              const conversationName = await generateConversationName(allMessagesStr);

              pendingWrites.push(
                prisma.chatHistory.update({
                  where: { id: capturedChatId },
                  data: {
                    conversationName: conversationName || 'New Conversation',
                  },
                })
              );
            }
          } catch (error) {
            sendError(error, 'conversation_metadata', controller);
          }

          if (pendingWrites.length > 0) {
            try {
              await prisma.$transaction(pendingWrites);
            } catch (error) {
              sendError(error, 'persist_messages', controller);
            }
          }

          // 🧠 Extract and update user memories in the background
          // This runs asynchronously and doesn't block the response
          if (capturedUserId) {
            updateUserMemoriesFromConversation(
              capturedUserId,
              conversationMessages.map(m => ({ sender: m.sender, content: m.content })),
              {
                category: currentChat?.category,
                subcategory: currentChat?.subcategory,
              }
            ).catch((error) => {
              // Log but don't fail - memory extraction is non-critical
              console.error('Background memory extraction failed:', error);
            });
          } else {
            console.warn('⚠️ Memory extraction skipped: userId is undefined');
          }

          sendProgress({ type: 'done' }, controller);
          controller.close();
        } catch (error) {
          sendError(error, 'general', controller);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');
  const userIdFromQuery = searchParams.get('userId');
  const cookieStore = await cookies();
  const userIdFromCookie = cookieStore.get('userId')?.value ?? null;
  const requesterUserId = userIdFromQuery ?? userIdFromCookie;

  if (!chatId) {
    return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
  }

  if (!requesterUserId) {
    return NextResponse.json({ error: 'Missing user identity' }, { status: 401 });
  }

  const chat = await prisma.chatHistory.findUnique({ where: { id: chatId } });
  if (!chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }

  if (chat.userId !== requesterUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const messages = await prisma.chatMessage.findMany({
    where: { chatId },
    orderBy: { timestamp: 'asc' },
  });

  return NextResponse.json({ chat, messages });
}