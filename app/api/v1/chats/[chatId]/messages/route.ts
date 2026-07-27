import { handleSendChatMessage } from "@/lib/api/handlers/chat";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { chatId } = await context.params;
  return handleSendChatMessage(request, chatId);
}
