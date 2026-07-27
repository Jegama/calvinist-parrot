import { handleQa } from "@/lib/api/handlers/qa";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleQa(request);
}
