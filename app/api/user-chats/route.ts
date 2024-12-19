// api/user-chats/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  // console.log(userId)

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const chats = await prisma.chatHistory.findMany({
    where: { userId },
    select: { id: true, conversationName: true },
    orderBy: { createdAt: 'desc' },
  });

  // console.log(chats);

  return NextResponse.json({ chats });
}
