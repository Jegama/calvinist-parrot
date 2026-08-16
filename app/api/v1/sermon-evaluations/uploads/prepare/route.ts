import { handlePrepareSermonUpload } from "@/lib/sermon-evaluation/handlers";

export function POST(request: Request) {
  return handlePrepareSermonUpload(request);
}

