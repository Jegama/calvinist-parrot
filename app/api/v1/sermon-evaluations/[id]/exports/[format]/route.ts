import { handleGetSermonExport } from "@/lib/sermon-evaluation/handlers";

type RouteContext = {
  params: Promise<{ id: string; format: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { id, format } = await params;
  return handleGetSermonExport(request, id, format);
}
