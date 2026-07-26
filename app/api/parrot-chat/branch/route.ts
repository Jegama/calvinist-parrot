import { NextResponse } from "next/server";
import { z } from "zod";

import { getChatActorId, resolveChatActor } from "@/lib/guest";
import prisma from "@/lib/prisma";
import { deterministicConversationTitle } from "@/lib/chat-title";
import { selectBranchPrefix } from "@/lib/chat-turns";
import { generateConversationName } from "@/utils/generateConversationName";

const branchSchema = z.object({
  sourceChatId: z.string().trim().min(1),
  sourceMessageId: z.string().trim().min(1),
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
  const requestId = crypto.randomUUID();

  const result = await prisma.$transaction(async (transaction) => {
    const branchedChat = await transaction.chatHistory.create({
      data: {
        userId: actorId,
        conversationName,
        category: sourceChat.category,
        issue_type: sourceChat.issue_type,
        subcategory: sourceChat.subcategory,
        denomination: sourceChat.denomination,
      },
    });

    if (prefix.length > 0) {
      await transaction.chatMessage.createMany({
        data: prefix.map((message) => ({
          chatId: branchedChat.id,
          sender: message.sender,
          content: message.content,
          requestId: message.requestId,
          timestamp: message.timestamp,
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

  return NextResponse.json({
    chatId: result.branchedChat.id,
    title: result.branchedChat.conversationName,
    editedMessageId: result.editedMessage.id,
    requestId,
  });
}
