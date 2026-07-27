import { handleLegacyQaPost } from "@/lib/api/handlers/qa";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleLegacyQaPost(request);
}
