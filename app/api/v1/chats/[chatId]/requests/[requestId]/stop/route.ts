import { handleStopChatRequest } from "@/lib/api/handlers/chat";

type RouteContext = {
  params: Promise<{ chatId: string; requestId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { chatId, requestId } = await context.params;
  return handleStopChatRequest(request, chatId, requestId);
}
