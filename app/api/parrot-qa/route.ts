import { handleLegacyQaPost } from "@/lib/api/handlers/qa";

export function POST(request: Request) {
  return handleLegacyQaPost(request);
}
