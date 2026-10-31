import { handleQa } from "@/lib/api/handlers/qa";

export function POST() {
  return handleQa();
}
