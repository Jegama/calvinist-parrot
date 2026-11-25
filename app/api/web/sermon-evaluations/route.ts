import { handleCreateSermonEvaluation } from "@/lib/sermon-evaluation/handlers";

export function POST(request: Request) {
  return handleCreateSermonEvaluation(request, "web");
}
