// app/api/journal/entries/[id]/continue-chat/route.ts
// POST: Create seeded chat thread, return chatId
// Follows the pattern from app/api/parrot-chat/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { acquireChatCreationLocks } from "@/lib/api/handlers/request-persistence-lock";
import { derivedCreationRequestId, recordChatEvents } from "@/lib/chat-analytics";
import { generateConversationName } from "@/utils/generateConversationName";
import type { Call1Output } from "@/types/journal";
import { formatCall1ForChat } from "@/lib/prompts/journal";
import { requireAuthenticatedUser } from "@/lib/auth";

/**
 * POST /api/journal/entries/[id]/continue-chat
 * Creates a new chat thread seeded with journal entry and reflection
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
    if (errorResponse || !authenticatedUserId)
      return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get user profile
    const profile = await prisma.userProfile.findUnique({
      where: { appwriteUserId: authenticatedUserId },
    });

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch entry + AI output
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { aiOutput: true },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Verify ownership
    if (entry.authorProfileId !== profile.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Format reflection for assistant message
    const call1 = entry.aiOutput?.call1 as Call1Output | null;
    const reflectionText = formatCall1ForChat(call1);

    // Generate conversation name from entry text
    const conversationName = await generateConversationName(entry.entryText.substring(0, 500));

    const key = request.headers.get("Idempotency-Key") || crypto.randomUUID();
    const creationRequestId = derivedCreationRequestId("journal", id, key);
    const chat = await prisma.$transaction(async (tx) => {
      await acquireChatCreationLocks(tx, authenticatedUserId, creationRequestId);
      const existing = await tx.chatHistory.findUnique({
        where: { userId_creationRequestId: { userId: authenticatedUserId, creationRequestId } },
      });
      if (existing) return existing;
      const createdChat = await tx.chatHistory.create({
        data: {
          userId: authenticatedUserId,
          creationRequestId,
          conversationName,
          category: "journal",
          subcategory: "reflection",
          issue_type: "personal",
        },
      });

      await recordChatEvents(tx, createdChat.id, creationRequestId, "web",
        { kind: "authenticated", userId: authenticatedUserId }, ["created"]);

      await tx.chatMessage.createMany({
        data: [
          {
            chatId: createdChat.id,
            analyticsExcluded: true,
            sender: "user",
            content: entry.entryText,
          },
          {
            chatId: createdChat.id,
            analyticsExcluded: true,
            sender: "parrot",
            content: reflectionText,
          },
        ],
      });

      return createdChat;
    });

    return NextResponse.json({
      chatId: chat.id,
      conversationName: chat.conversationName,
    });
  } catch (error) {
    console.error("Error creating continue-in-chat:", error);
    return NextResponse.json(
      { error: "Failed to create chat" },
      { status: 500 }
    );
  }
}
