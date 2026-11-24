import { NextResponse } from "next/server";
import { z } from "zod";

import { getChatActorId, resolveChatActor } from "@/lib/guest";
import prisma from "@/lib/prisma";
import { acquireChatCreationLocks } from "@/lib/api/handlers/request-persistence-lock";
import { derivedCreationRequestId, recordChatEvents } from "@/lib/chat-analytics";
import { deterministicConversationTitle } from "@/lib/chat-title";
import { selectBranchPrefix } from "@/lib/chat-turns";
import { generateConversationName } from "@/utils/generateConversationName";

const branchSchema = z.object({
  sourceChatId: z.string().trim().min(1),
  sourceMessageId: z.string().trim().min(1),
  requestId: z.string().trim().min(1).max(191).optional(),
  editedText: z.string().trim().min(1).max(20_000),
});

function ensureDistinctTitle(
  generatedTitle: string,
  sourceTitle: string,
  editedText: string,
) {
  if (
    generatedTitle.localeCompare(sourceTitle, undefined, {
      sensitivity: "base",
      usage: "search",
    }) !== 0
  ) {
    return generatedTitle;
  }

  const fallback = deterministicConversationTitle(`user: ${editedText}`);
  if (
    fallback.localeCompare(sourceTitle, undefined, {
      sensitivity: "base",
      usage: "search",
    }) !== 0
  ) {
    return fallback;
  }

  return `${fallback.slice(0, 61).trim()} — Edited`;
}

export async function POST(request: Request) {
  const parsed = branchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid branch request" }, { status: 400 });
  }

  const actor = await resolveChatActor();
  const actorId = getChatActorId(actor);
  const sourceChat = await prisma.chatHistory.findUnique({
    where: { id: parsed.data.sourceChatId },
  });

  if (!sourceChat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  if (sourceChat.userId !== actorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sourceMessages = await prisma.chatMessage.findMany({
    where: { chatId: sourceChat.id },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
  });

  let prefix;
  try {
    prefix = selectBranchPrefix(sourceMessages, parsed.data.sourceMessageId);
  } catch {
    return NextResponse.json(
      { error: "The selected user message was not found" },
      { status: 404 },
    );
  }

  const namingContext = [
    ...prefix
      .filter((message) => message.sender === "user" || message.sender === "parrot")
      .map((message) => `${message.sender}: ${message.content}`),
    `user: ${parsed.data.editedText}`,
  ].join("\n");
  const generatedTitle = await generateConversationName(namingContext);
  const conversationName = ensureDistinctTitle(
    generatedTitle,
    sourceChat.conversationName,
    parsed.data.editedText,
  );
  const requestId = parsed.data.requestId
    ? derivedCreationRequestId("branch", sourceChat.id, parsed.data.sourceMessageId, parsed.data.requestId)
    : crypto.randomUUID();

  const result = await prisma.$transaction(async (transaction) => {
    await acquireChatCreationLocks(transaction, actorId, requestId);
    const existing = await transaction.chatHistory.findUnique({
      where: { userId_creationRequestId: { userId: actorId, creationRequestId: requestId } },
      select: {
        id: true, conversationName: true,
        messages: { where: { sender: "user", requestId }, select: { id: true, content: true } },
      },
    });
    if (existing) {
      const editedMessage = existing.messages[0];
      if (existing.messages.length !== 1 || editedMessage.content !== parsed.data.editedText) return null;
      return { branchedChat: existing, editedMessage };
    }
    const branchedChat = await transaction.chatHistory.create({
      data: {
        creationRequestId: requestId,
        userId: actorId,
        conversationName,
        category: sourceChat.category,
        issue_type: sourceChat.issue_type,
        subcategory: sourceChat.subcategory,
        denomination: sourceChat.denomination,
      },
    });

    await recordChatEvents(transaction, branchedChat.id, requestId, "web", actor, ["created", "submission"]);

    if (prefix.length > 0) {
      await transaction.chatMessage.createMany({
        data: prefix.map((message) => ({
          chatId: branchedChat.id,
          sender: message.sender,
          content: message.content,
          requestId: message.requestId,
          timestamp: message.timestamp,
          analyticsExcluded: true,
        })),
      });
    }

    const latestPrefixTimestampValue = prefix.at(-1)?.timestamp;
    const latestPrefixTimestamp = latestPrefixTimestampValue
      ? new Date(latestPrefixTimestampValue).getTime()
      : 0;
    const editedMessage = await transaction.chatMessage.create({
      data: {
        chatId: branchedChat.id,
        sender: "user",
        content: parsed.data.editedText,
        requestId,
        timestamp: new Date(Math.max(Date.now(), latestPrefixTimestamp + 1)),
      },
    });

    return { branchedChat, editedMessage };
  });

  if (!result) {
    return NextResponse.json({ error: "Request ID conflicts with an existing branch" }, { status: 409 });
  }
  return NextResponse.json({
    chatId: result.branchedChat.id,
    title: result.branchedChat.conversationName,
    editedMessageId: result.editedMessage.id,
    requestId,
  });
}
