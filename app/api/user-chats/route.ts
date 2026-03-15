// api/user-chats/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthenticatedUser } from '@/lib/auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(searchParams.get('userId') ?? undefined);
  if (errorResponse || !authenticatedUserId) return errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chats = await prisma.chatHistory.findMany({
    where: { userId: authenticatedUserId },
    select: { id: true, conversationName: true },
    orderBy: { modifiedAt: 'desc' },
  });

  // console.log(chats);

  return NextResponse.json({ chats });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');
  const { userId: effectiveUserId, errorResponse } = await requireAuthenticatedUser(searchParams.get('userId') ?? undefined);

  if (errorResponse || !effectiveUserId) {
    return errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
