import { serializeSpec } from "../../../../lib/api/spec";

export function GET() {
  return new Response(serializeSpec(), {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
