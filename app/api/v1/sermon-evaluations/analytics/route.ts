import { handleGetSermonAnalytics } from "@/lib/sermon-evaluation/handlers";

export function GET() {
  return handleGetSermonAnalytics();
}

