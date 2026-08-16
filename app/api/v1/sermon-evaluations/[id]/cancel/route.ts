import { handleCancelSermonEvaluation } from "@/lib/sermon-evaluation/handlers";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  { params }: RouteContext,
) {
  const { id } = await params;
  return handleCancelSermonEvaluation(id);
}

