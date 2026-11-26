import { findChurchesInputSchema } from "@/lib/api/contracts/church";
import { findChurches } from "@/lib/api/handlers/church";
import { executeV1Safely } from "@/lib/api/handlers/http";

export function GET(request: Request) {
  return executeV1Safely(async () => {
    const query = new URL(request.url).searchParams;
    const input = Object.fromEntries(Array.from(query, ([key, value]) => [
      key, (key === "page" || key === "pageSize") && /^\d+$/.test(value) ? Number(value) : value,
    ]));
    const result = findChurchesInputSchema.safeParse(input);
    if (!result.success || query.size !== Object.keys(input).length) {
      return Response.json({ error: "Invalid directory filters or pagination." }, { status: 400 });
    }
    return Response.json(await findChurches(result.data));
  });
}
