import { handleFinalizeSermonUpload } from "@/lib/sermon-evaluation/handlers";

export function POST(request: Request) {
  return handleFinalizeSermonUpload(request);
}

