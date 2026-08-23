import { handleGetSermonEvaluationStatus } from "@/lib/sermon-evaluation/handlers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  return handleGetSermonEvaluationStatus(id);
}

