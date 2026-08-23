import { handleReevaluateSermon } from "@/lib/sermon-evaluation/handlers";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return handleReevaluateSermon(request, id);
}

