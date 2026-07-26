// api/user-chats/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getChatActorId, resolveChatActor } from '@/lib/guest';
import { z } from 'zod';

const renameSchema = z.object({
  chatId: z.string().trim().min(1),
  conversationName: z.string().trim().min(1).max(120),
});

export async function GET(request: Request) {
  void request;
  const actor = await resolveChatActor();
  const authenticatedUserId = getChatActorId(actor);

  const chats = await prisma.chatHistory.findMany({
    where: { userId: authenticatedUserId },
    select: { id: true, conversationName: true, modifiedAt: true },
    orderBy: { modifiedAt: 'desc' },
  });

  // console.log(chats);

  return NextResponse.json({ chats });
}

export async function PATCH(request: Request) {
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid rename request' }, { status: 400 });
  }

  const actor = await resolveChatActor();
  const effectiveUserId = getChatActorId(actor);
  const existing = await prisma.chatHistory.findUnique({
    where: { id: parsed.data.chatId },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }
  if (existing.userId !== effectiveUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const chat = await prisma.chatHistory.update({
    where: { id: parsed.data.chatId },
    data: { conversationName: parsed.data.conversationName },
    select: { id: true, conversationName: true, modifiedAt: true },
  });

  return NextResponse.json({ chat });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');
  const actor = await resolveChatActor();
  const effectiveUserId = getChatActorId(actor);

  if (!chatId) {
    return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
  }

  try {
    // Verify chat ownership
    const chat = await prisma.chatHistory.findUnique({ where: { id: chatId } });
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }
    if (chat.userId !== effectiveUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Hard delete chat + cascade messages (chatMessage references chatHistory via relation)
    await prisma.chatMessage.deleteMany({ where: { chatId } });
    await prisma.chatHistory.delete({ where: { id: chatId } });

    return NextResponse.json({ success: true, chatId });
  } catch (error) {
    console.error('Failed to delete chat', { chatId, effectiveUserId, error });
    return NextResponse.json({ error: 'Server error deleting chat' }, { status: 500 });
  }
}
