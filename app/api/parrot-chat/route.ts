// app/api/parrot-chat/route.ts

export const maxDuration = 60;

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
    const { generateConversationName } = await import('@/utils/generateConversationName');
    const allMessagesStr = `user: ${initialQuestion}\nparrot: ${initialAnswer}`;
    const conversationName = await generateConversationName(allMessagesStr);

    const chat = await prisma.chatHistory.create({
      data: {
        userId,
        conversationName,
        category: category || '',
        subcategory: subcategory || '',
        issue_type: issue_type || '',
      },
    });

    // Create initial messages
    await prisma.chatMessage.create({
      data: { chatId: chat.id, sender: 'user', content: initialQuestion },
    });

    await prisma.chatMessage.create({
      data: { chatId: chat.id, sender: 'parrot', content: initialAnswer },
    });

    return NextResponse.json({ chatId: chat.id });
  }

  // If userId and initial message are provided but no chatId, start a new chat session. This is from `app/page.tsx`.
  if (userId && initialQuestion && !chatId) {
    const chat = await prisma.chatHistory.create({
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

    // Create initial messages
    await prisma.chatMessage.create({
      data: { chatId: chat.id, sender: 'user', content: initialQuestion },
    });

    return NextResponse.json({ chatId: chat.id });
  }

  // If chatID and message run main system <-- This continues the converation and is the main use case.
  if (chatId && message) {
    const [progressUtils, mainAgentModule, promptsModule, messagesModule, conversationUtils] = await Promise.all([
      import('@/lib/progressUtils'),
      import('@/utils/langChainAgents/mainAgent'),
      import('@/lib/prompts'),
      import('@langchain/core/messages'),
      import('@/utils/generateConversationName'),
    ]);

    const { sendError, sendProgress } = progressUtils;
    const { parrotWorkflow } = mainAgentModule;
    const prompts = promptsModule;
    const { SystemMessage, HumanMessage, AIMessage } = messagesModule;
    const { generateConversationName, buildCategorizationMessages } = conversationUtils;

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

    const secondaryPromptText = mapDenominationPrompt(denomination);
    const coreSysPromptWithDenomination = prompts.CORE_SYS_PROMPT.replace('{denomination}', secondaryPromptText);
    const newParrotSysPrompt = prompts.PARROT_SYS_PROMPT_MAIN.replace('{CORE}', coreSysPromptWithDenomination);


    const stream = new ReadableStream({
      async start(controller) {
        // Message accumulator to avoid repeated DB fetches
        let conversationMessages: { sender: string; content: string }[] = [];
        let hasAnnouncedThinking = false;
        let hasAnnouncedDrafting = false;
        const activeToolRuns = new Set<string>();

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
          const previousMessages = await prisma.chatMessage.findMany({
            where: { chatId },
            orderBy: { timestamp: 'asc' },
          });

          conversationMessages = previousMessages.map((msg: { sender: string; content: string }) => ({
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
            await prisma.chatMessage.create({
              data: { chatId, sender: 'user', content: message },
            });

            sendProgress({
              type: 'progress',
              title: 'Message received',
              content: 'Working on a thoughtful reply...',
            }, controller);
          }

          // Parrot's answer
          let parrotReply = '';
          try {
            const parrotHistory = buildParrotHistory(
              conversationMessages,
              newParrotSysPrompt
            );

            const eventStream = parrotWorkflow.streamEvents(
              { messages: parrotHistory },
              { version: "v2", streamMode: ["updates", "messages"] }
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
                      data: { chatId, sender: 'gotQuestions', content: parsedReferences },
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
            await prisma.chatMessage.create({
              data: { chatId, sender: 'parrot', content: parrotReply },
            });
            conversationMessages.push({ sender: 'parrot', content: parrotReply });
            sendProgress({
              type: 'progress',
              title: 'Final polishing',
              content: 'Answer ready — sending it your way...',
            }, controller);

          } catch (error) {
            sendError(error, 'parrot_response', controller);
          }

          // Handle conversation naming and categorization
          try {
            const currentChat = await prisma.chatHistory.findUnique({ where: { id: chatId } });
            if (currentChat && currentChat.conversationName === 'New Conversation') {
              const categorizationMessages = buildCategorizationMessages(message);
              const { default: OpenAI } = await import('openai');
              const miniModel = "gpt-5-mini";
              const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
              });
              const categorizationResponse = await openai.chat.completions.create({
                model: miniModel,
                messages: categorizationMessages,
                response_format: {
                  type: 'json_schema',
                  json_schema: prompts.categorizationSchema,
                },
              });

              const categorization = JSON.parse(categorizationResponse.choices[0]?.message?.content || '{}');
              const allMessagesStr = conversationMessages.map((m) => `${m.sender}: ${m.content}`).join('\n');
              const conversationName = await generateConversationName(allMessagesStr);

              await prisma.chatHistory.update({
                where: { id: chatId },
                data: {
                  conversationName: conversationName || 'New Conversation',
                  category: categorization.category || '',
                  subcategory: categorization.subcategory || '',
                  issue_type: categorization.issue_type || '',
                },
              });
            }
          } catch (error) {
            sendError(error, 'conversation_metadata', controller);
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

  if (!chatId) {
    return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
  }

  const chat = await prisma.chatHistory.findUnique({ where: { id: chatId } });
  if (!chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }
  const messages = await prisma.chatMessage.findMany({
    where: { chatId },
    orderBy: { timestamp: 'asc' },
  });

  return NextResponse.json({ chat, messages });
}