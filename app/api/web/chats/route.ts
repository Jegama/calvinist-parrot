import { executeChatCommand, handleCreateChat } from "@/lib/api/handlers/chat";

export function POST(request: Request) {
  return handleCreateChat(request, (req, command) => executeChatCommand(req, command, "web"));
}
