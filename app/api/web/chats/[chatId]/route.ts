import { executeGetChat, handleGetChat } from "@/lib/api/handlers/chat";

export async function GET(_request: Request, context: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await context.params;
  return handleGetChat(chatId, id => executeGetChat(id, { website: true }));
}
