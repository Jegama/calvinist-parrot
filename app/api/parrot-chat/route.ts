// api/parrot-chat/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import OpenAI from 'openai';
import {
  PARROT_SYS_PROMPT_MAIN,
  CALVIN_SYS_PROMPT_MAIN,
  categorizationSchema,
} from '@/lib/prompts';
import {
  generateConversationName, 
  buildCategorizationMessages
} from '@/utils/generateConversationName';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mini_model = "gpt-4o-mini";

// Helper: build parrot_conversation_history from DB messages
function buildParrotHistory(messages: { sender: string; content: string }[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  // According to PARROT_SYS_PROMPT_MAIN:
  // - user = /human/
  // - parrot = assistant
  // - calvin = user but prefixed with /calvin/
  // The system prompt instructs how roles interact.
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: PARROT_SYS_PROMPT_MAIN },
  ];

  for (const msg of messages) {
    if (msg.sender === 'user') {
      history.push({ role: 'user', content: `/human/ ${msg.content}` });
    } else if (msg.sender === 'parrot') {
      history.push({ role: 'assistant', content: msg.content });
    } else if (msg.sender === 'calvin') {
      // Calvin's messages appear as user messages to Parrot, but prefixed so Parrot knows it's Calvin
      history.push({ role: 'user', content: `/calvin/ ${msg.content}` });
    }
  }

  return history;
}

// Helper: build calvin_conversation_history from DB messages
function buildCalvinHistory(messages: { sender: string; content: string }[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  // According to CALVIN_SYS_PROMPT_MAIN:
  // - user = /human/
  // - parrot = /parrot/ as user
  // - calvin = assistant
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: CALVIN_SYS_PROMPT_MAIN },
  ];

  for (const msg of messages) {
    if (msg.sender === 'user') {
      history.push({ role: 'user', content: `/human/ ${msg.content}` });
    } else if (msg.sender === 'parrot') {
      // Parrot's messages appear as user messages to Calvin, but prefixed so Calvin knows it's Parrot
      history.push({ role: 'user', content: `/parrot/ ${msg.content}` });
    } else if (msg.sender === 'calvin') {
      history.push({ role: 'assistant', content: msg.content });
    }
  }

  return history;
}

export async function POST(request: Request) {
  const { userId, chatId, message } = await request.json();
  const encoder = new TextEncoder();

  console.log(userId, chatId, message)

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

  // If userId is provided but no chatId, start a new chat session
  if (chatId && message) {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Immediately send a startup message
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'info', message: 'Streaming started...' }) + '\n'));

          // Save the user message
          await prisma.chatMessage.create({
            data: { chatId, sender: 'user', content: message },
          });

          const previousMessages = await prisma.chatMessage.findMany({
            where: { chatId },
            orderBy: { timestamp: 'asc' },
          });

          const parrotMessages = previousMessages.map((msg) => ({
            sender: msg.sender,
            content: msg.content,
          }));

          // Step 1: Parrot's answer
          const parrotHistoryForParrot = buildParrotHistory(parrotMessages);
          const parrotCompletion = await openai.chat.completions.create({
            model: mini_model,
            messages: parrotHistoryForParrot,
            temperature: 0,
            stream: true,
          });

          let parrotReply = '';
          for await (const part of parrotCompletion) {
            const content = part.choices[0]?.delta?.content || '';
            if (content) {
              parrotReply += content;
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'parrot', content }) + '\n'));
            }
          }
          
          // Save Parrot's reply
          await prisma.chatMessage.create({
            data: { chatId, sender: 'parrot', content: parrotReply },
          });

          // Step 2: Calvin's feedback
          const messagesAfterParrot = await prisma.chatMessage.findMany({ where: { chatId }, orderBy: { timestamp: 'asc' } });
          const calvinHistory = buildCalvinHistory(messagesAfterParrot);

          const calvinCompletion = await openai.chat.completions.create({
            model: mini_model,
            messages: calvinHistory,
            temperature: 0,
            stream: true,
          });

          let calvinReply = '';
          for await (const part of calvinCompletion) {
            const content = part.choices[0]?.delta?.content || '';
            if (content) {
              calvinReply += content;
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'calvin', content }) + '\n'));
            }
          }

          // Save Calvin's reply
          await prisma.chatMessage.create({
            data: { chatId, sender: 'calvin', content: calvinReply },
          });

          // Step 3: Parrot’s revision
          const messagesAfterCalvin = await prisma.chatMessage.findMany({ where: { chatId }, orderBy: { timestamp: 'asc' } });
          const parrotHistoryForRevision = buildParrotHistory(messagesAfterCalvin);

          const parrotRevisionCompletion = await openai.chat.completions.create({
            model: mini_model,
            messages: parrotHistoryForRevision,
            temperature: 0,
            stream: true,
          });

          let parrotFinalReply = '';
          for await (const part of parrotRevisionCompletion) {
            const content = part.choices[0]?.delta?.content || '';
            if (content) {
              parrotFinalReply += content;
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'parrot_final', content }) + '\n'));
            }
          }

          // Save Parrot's final reply
          await prisma.chatMessage.create({
            data: { chatId, sender: 'parrot', content: parrotFinalReply },
          });

          const messagesAfterInteraction = await prisma.chatMessage.findMany({
            where: { chatId },
            orderBy: { timestamp: 'asc' },
          });

          // If conversation name still 'New Conversation', classify and name
          const currentChat = await prisma.chatHistory.findUnique({ where: { id: chatId } });
          if (currentChat && currentChat.conversationName === 'New Conversation') {
            const categorizationMessages = buildCategorizationMessages(message);
            const categorizationResponse = await openai.chat.completions.create({
              model: mini_model,
              messages: categorizationMessages,
              response_format: {
                type: 'json_schema',
                json_schema: categorizationSchema,
              },
              temperature: 0,
            });

            const categorization = JSON.parse(categorizationResponse.choices[0]?.message?.content || '{}');

            const allMessagesStr = messagesAfterInteraction.map((m) => `${m.sender}: ${m.content}`).join('\n');
            const conversationName = await generateConversationName(allMessagesStr);

            await prisma.chatHistory.update({
              where: { id: chatId },
              data: {
                conversationName: conversationName || 'Conversation',
                category: categorization.category || '',
                subcategory: categorization.subcategory || '',
                issue_type: categorization.issue_type || '',
              },
            });
          }

          // End of stream
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
          controller.close();

        } catch (error) {
          console.error('Error during conversation flow:', error);
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
