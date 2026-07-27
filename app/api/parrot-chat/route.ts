import {
  handleLegacyChatGet,
  handleLegacyChatPost,
} from "@/lib/api/handlers/chat";

export function POST(request: Request) {
  return handleLegacyChatPost(request);
}

export function GET(request: Request) {
  return handleLegacyChatGet(request);
}
