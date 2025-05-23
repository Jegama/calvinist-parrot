// app/api/parrot-chat/route.ts

export const maxDuration = 60;

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import OpenAI from 'openai';
import * as prompts from '@/lib/prompts'
import {
  generateConversationName,
  buildCategorizationMessages
} from '@/utils/generateConversationName';
import { sendError, sendProgress } from '@/lib/progressUtils';
import { parrotWorkflow } from "@/utils/langChainAgents/mainAgent";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mini_model = "gpt-4.1-mini";

function buildParrotHistory(
  messages: { sender: string; content: string }[],
  parrot_sys_prompt: string
): (SystemMessage | HumanMessage | AIMessage)[] {
  const history: (SystemMessage | HumanMessage | AIMessage)[] = [
    new SystemMessage(parrot_sys_prompt),
  ];
  for (const msg of messages) {
    if (msg.sender === 'user') {
      history.push(new HumanMessage(msg.content));
    } else if (msg.sender === 'parrot') {
      history.push(new AIMessage(msg.content));
    }
  }
  return history;
}

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
    isAutoTrigger
  }: ChatRequestBody = await request.json();

  // Map denomination to corresponding system prompt
  let secondary_prompt_text;
  switch (denomination) {
    case "reformed-baptist":
      secondary_prompt_text = prompts.secondary_reformed_baptist;
      break;
    case "presbyterian":
      secondary_prompt_text = prompts.secondary_presbyterian;
      break;
    case "wesleyan":
      secondary_prompt_text = prompts.secondary_wesleyan;
      break;
    case "lutheran":
      secondary_prompt_text = prompts.secondary_lutheran;
      break;
    case "anglican":
      secondary_prompt_text = prompts.secondary_anglican;
      break;
    case "pentecostal":
      secondary_prompt_text = prompts.secondary_pentecostal;
      break;
    case "non-denom":
      secondary_prompt_text = prompts.secondary_non_denom;
      break;
    default:
      secondary_prompt_text = prompts.secondary_reformed_baptist; // Default to reformed-baptist
  }

  const core_sys_prompt_with_denomination = prompts.CORE_SYS_PROMPT.replace('{denomination}', secondary_prompt_text);
  const new_parrot_sys_prompt = prompts.PARROT_SYS_PROMPT_MAIN.replace('{CORE}', core_sys_prompt_with_denomination);

  // Handle new chat from Parrot QA
  if (userId && initialQuestion && initialAnswer && !chatId) {
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
        userId,
        conversationName: 'New Conversation',
        category: '',
        subcategory: '',
        issue_type: '',
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
    const stream = new ReadableStream({
      async start(controller) {
        // Message accumulator to avoid repeated DB fetches
        let conversationMessages: { sender: string; content: string }[] = [];

        try {
          // Fetch initial messages only once
          const previousMessages = await prisma.chatMessage.findMany({
            where: { chatId },
            orderBy: { timestamp: 'asc' },
          });

          conversationMessages = previousMessages.map((msg: { sender: string; content: string }) => ({
            sender: msg.sender,
            content: msg.content,
          }));

          // Only add and save user message if not auto-triggered. This is from `app/[chatId]/page.tsx`, when you load the page and the last message is from the user.
          if (!isAutoTrigger) {
            const userMessage = { sender: 'user', content: message };
            conversationMessages.push(userMessage);
            await prisma.chatMessage.create({
              data: { chatId, sender: 'user', content: message },
            });
          }

          // Parrot's answer
          let parrotReply = '';
          try {
            const parrotHistory = buildParrotHistory(
              conversationMessages,
              new_parrot_sys_prompt
            );

            const eventStream = parrotWorkflow.streamEvents(
              { messages: parrotHistory },
              { version: "v2" }
            );

            for await (const { event, tags, data } of eventStream) {
              if (event === "on_chat_model_stream") {
                // data.chunk is the partial token chunk for the LLM's AIMessage
                if (data.chunk?.content) {
                  parrotReply += data.chunk.content;
                  sendProgress({ type: 'parrot', content: data.chunk.content }, controller);
                }
              } else if (event === "on_chain_start") {
                // New progress handling using data.input.messages
                if (data.input?.messages?.length > 0) {
                  const firstMsg = data.input.messages[0];
                  if (firstMsg.tool_calls && firstMsg.tool_calls.length > 0) {
                    const toolCall = firstMsg.tool_calls[0];
                    if (toolCall.args?.query) {
                      sendProgress({ type: 'progress', title: "Looking for articles", content: toolCall.args.query }, controller);
                    } else if (toolCall.args?.draft) {
                      sendProgress({ type: 'progress', title: "Asking for feedback", content: toolCall.args.draft.slice(0, 50) }, controller);
                    } else if (toolCall.args?.passages) {
                      try {
                        const passages = JSON.parse(toolCall.args.passages);
                        sendProgress({ 
                          type: 'progress', 
                          title: "Looking commentary on:", 
                          content: Array.isArray(passages) ? passages.join(", ") : String(passages) 
                        }, controller);
                      } catch (e) {
                        // If parsing fails, use the string as is
                        sendProgress({ 
                          type: 'progress', 
                          title: "Looking commentary on:", 
                          content: String(toolCall.args.passages) 
                        }, controller);
                        console.error("Failed to parse passages", e);
                      }
                    } else {
                      sendProgress({ type: 'progress', title: "Using a tool", content: "" }, controller);
                    }
                  // } else {
                  //   sendProgress({ type: 'progress', title: "Thinking", content: "" }, controller);
                  }
                }
              // } else if (event === "on_chat_model_start") {
              //   console.log("Chain Model start:", data);
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
                    sendProgress({ type: 'progress', title: "Thinking", content: "I am deciding on my next step." }, controller);
                    await prisma.chatMessage.create({
                      data: { chatId, sender: 'gotQuestions', content: parsedReferences },
                    });
                  }
                } else if (data.output.name === "CalvinReviewer") {
                  // Pass the CalvinReviewer feedback to the front-end
                  sendProgress({ type: 'calvin', content: data.output.content }, controller);
                  sendProgress({ type: 'progress', title: "Thinking", content: "Writing my final response." }, controller);
                  await prisma.chatMessage.create({
                    data: { chatId, sender: 'calvin', content: data.output.content },
                  });
                } else if (data.output.name === "BibleCommentary") {
                  // Pass the BibleCommentary feedback to the front-end
                  sendProgress({ type: 'progress', title: "Thinking", content: "I am deciding on my next step." }, controller);
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

          } catch (error) {
            sendError(error, 'parrot_response', controller);
          }

          // Handle conversation naming and categorization
          try {
            const currentChat = await prisma.chatHistory.findUnique({ where: { id: chatId } });
            if (currentChat && currentChat.conversationName === 'New Conversation') {
              const categorizationMessages = buildCategorizationMessages(message);
              const categorizationResponse = await openai.chat.completions.create({
                model: mini_model,
                messages: categorizationMessages,
                response_format: {
                  type: 'json_schema',
                  json_schema: prompts.categorizationSchema,
                },
                temperature: 0,
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
  const messages = await prisma.chatMessage.findMany({
    where: { chatId },
    orderBy: { timestamp: 'asc' },
  });

  return NextResponse.json({ chat, messages });
}