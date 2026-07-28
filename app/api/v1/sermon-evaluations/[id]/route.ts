import {
  handleDeleteSermonEvaluation,
  handleGetSermonEvaluation,
} from "@/lib/sermon-evaluation/handlers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  return handleGetSermonEvaluation(id);
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  const { id } = await params;
  return handleDeleteSermonEvaluation(id);
}

