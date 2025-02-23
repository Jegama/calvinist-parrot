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

const mini_model = "gpt-4o-mini";

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
    } else if (msg.sender === 'parrot' || msg.sender === 'calvin') {
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
    denomination = "reformed-baptist"
  }: ChatRequestBody = await request.json();

  // Map denomination to corresponding system prompt
  let sys_prompt;
  switch (denomination) {
    case "reformed-baptist":
      sys_prompt = prompts.CORE_SYS_PROMPT;
      break;
    case "presbyterian":
      sys_prompt = prompts.CORE_SYS_PROMPT_PRESBYTERIAN;
      break;
    case "wesleyan":
      sys_prompt = prompts.CORE_SYS_PROMPT_WESLEYAN;
      break;
    case "lutheran":
      sys_prompt = prompts.CORE_SYS_PROMPT_LUTHERAN;
      break;
    case "anglican":
      sys_prompt = prompts.CORE_SYS_PROMPT_ANGLICAN;
      break;
    case "pentecostal":
      sys_prompt = prompts.CORE_SYS_PROMPT_PENTECOSTAL;
      break;
    case "non-denom":
      sys_prompt = prompts.CORE_SYS_PROMPT_NON_DENOM_EVANGELICAL;
      break;
    default:
      sys_prompt = prompts.CORE_SYS_PROMPT;
  }

  const new_parrot_sys_prompt = prompts.PARROT_SYS_PROMPT_MAIN.replace('{CORE}', sys_prompt);

  // Handle new chat with initial content
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

  // If userId is provided but no chatId, start a new chat session
  if (userId && !chatId) {
    const chat = await prisma.chatHistory.create({
      data: {
        userId,
        conversationName: 'New Conversation',
        category: '',
        subcategory: '',
        issue_type: '',
      },
    });
    return NextResponse.json({ chatId: chat.id });
  }

  // If chatID and message run main system
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

          // Add and save user message
          const userMessage = { sender: 'user', content: message };
          conversationMessages.push(userMessage);
          await prisma.chatMessage.create({
            data: { chatId, sender: 'user', content: message },
          });

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
              } else if (event === "on_tool_start") {
                sendProgress({ type: 'progress', content: tags ? tags.join(', ') : '' }, controller);
                console.log("Tool start:", tags);
              } else if (event === "on_tool_end") {
                console.log("Tool end:", data.output.name);
                if (data.output.name === "gotQuestionsSearch") {
                  // Parse the JSON content from the tool's output
                  let toolOutput;
                  try {
                    toolOutput = JSON.parse(data.output.content);
                  } catch (e) {
                    console.error("Failed to parse gotQuestionsSearch output", e);
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
                    await prisma.chatMessage.create({
                      data: { chatId, sender: 'gotQuestions', content: parsedReferences },
                    });
                  }
                } else if (data.output.name === "CalvinReviewer") {
                  // Pass the CalvinReviewer feedback to the front-end
                  sendProgress({ type: 'calvin', content: data.output.content }, controller);
                  await prisma.chatMessage.create({
                    data: { chatId, sender: 'calvin', content: data.output.content },
                  })
                // } else if (data.output.name === "BibleCommentary") {
                //   // Pass the BibleCommentary feedback to the front-end
                //   sendProgress({ type: 'bibleCommentary', content: data.output.content }, controller);
                }
                // } else if (event === "on_chain_end") {
                //   console.log("Chain start:", data.output.);
              } else {
                console.log("Unhandled event:", event);
              }
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