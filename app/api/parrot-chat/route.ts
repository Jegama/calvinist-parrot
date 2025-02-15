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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mini_model = "gpt-4o-mini";

function buildParrotHistory(
  messages: { sender: string; content: string }[],
  parrot_sys_prompt: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: parrot_sys_prompt },
  ];
  for (const msg of messages) {
    history.push({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
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
  const encoder = new TextEncoder();

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
        // Helper function to send errors to client
        const sendError = (error: Error | unknown, stage: string) => {
          console.error(`Error during ${stage}:`, error);
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'error',
            stage,
            message: 'An error occurred, but continuing conversation...'
          }) + '\n'));
        };

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
            const parrotHistoryForParrot = buildParrotHistory(conversationMessages, new_parrot_sys_prompt);
            const parrotCompletion = await openai.chat.completions.create({
              model: mini_model,
              messages: parrotHistoryForParrot,
              temperature: 0,
              stream: true,
            });

            for await (const part of parrotCompletion) {
              const content = part.choices[0]?.delta?.content || '';
              if (content) {
                parrotReply += content;
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'parrot', content }) + '\n'));
              }
            }

            await prisma.chatMessage.create({
              data: { chatId, sender: 'parrot', content: parrotReply },
            });
            conversationMessages.push({ sender: 'parrot', content: parrotReply });
          } catch (error) {
            sendError(error, 'parrot_response');
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
            sendError(error, 'conversation_metadata');
          }

          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
          controller.close();
        } catch (error) {
          sendError(error, 'general');
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
