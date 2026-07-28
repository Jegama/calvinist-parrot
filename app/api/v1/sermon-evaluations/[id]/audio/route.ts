import { handleDeleteSermonAudio } from "@/lib/sermon-evaluation/handlers";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  const { id } = await params;
  return handleDeleteSermonAudio(id);
}

