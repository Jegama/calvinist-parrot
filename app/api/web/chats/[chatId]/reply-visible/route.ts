import { z } from "zod";
import { getChatParamsSchema } from "@/lib/api/contracts/chat";
import { parseJsonRequest } from "@/lib/api/handlers/http";
import { recordEngagement } from "@/lib/analytics/engagement-store";
import { pendingVisibleReply } from "@/lib/chat-analytics";
import { getChatActorId, resolveChatActor } from "@/lib/guest";
import prisma from "@/lib/prisma";

const receipt = z.strictObject({ operation: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: Request, context: { params: Promise<{ chatId: string }> }) {
  const params = getChatParamsSchema.safeParse(await context.params);
  if (!params.success) return new Response(null, { status: 400 });
  const body = await parseJsonRequest(request, receipt);
  if (!body.success) return body.response;

  const { chatId } = params.data;
  const actorId = getChatActorId(await resolveChatActor());
  const owner = await prisma.chatHistory.findFirst({
    where: { id: chatId, userId: actorId }, select: { id: true },
  });
  if (!owner) return new Response(null, { status: 404 });

  if (await pendingVisibleReply(chatId, prisma) === body.data.operation) {
    await recordEngagement("chat", "reply_visible", body.data.operation);
  }
  return new Response(null, { status: 204 });
}
