import {
  handleCreateSermonEvaluation,
  handleListSermonEvaluations,
} from "@/lib/sermon-evaluation/handlers";

export function GET(request: Request) {
  return handleListSermonEvaluations(request);
}

export function POST(request: Request) {
  return handleCreateSermonEvaluation(request);
}

