import { handleGetChat } from "@/lib/api/handlers/chat";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { chatId } = await context.params;
  return handleGetChat(chatId);
}
