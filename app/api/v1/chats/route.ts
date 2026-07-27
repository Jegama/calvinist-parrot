import { handleCreateChat } from "@/lib/api/handlers/chat";

export function POST(request: Request) {
  return handleCreateChat(request);
}
