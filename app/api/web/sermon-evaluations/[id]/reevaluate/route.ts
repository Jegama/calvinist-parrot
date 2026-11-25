import { handleReevaluateSermon } from "@/lib/sermon-evaluation/handlers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleReevaluateSermon(request, id, "web");
}
