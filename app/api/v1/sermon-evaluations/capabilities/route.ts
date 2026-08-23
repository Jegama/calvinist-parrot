import { handleGetSermonCapabilities } from "@/lib/sermon-evaluation/handlers";

export function GET() {
  return handleGetSermonCapabilities();
}

