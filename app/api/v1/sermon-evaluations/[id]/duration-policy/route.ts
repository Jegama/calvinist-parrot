import { handleUpdateSermonDurationPolicy } from "@/lib/sermon-evaluation/handlers";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  const { id } = await params;
  return handleUpdateSermonDurationPolicy(request, id);
}

