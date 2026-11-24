import { analyticsAccess } from "@/lib/analytics/access";
import { reportDays } from "@/lib/analytics/period";
import { loadAnalyticsReport } from "@/lib/analytics/report";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const access = await analyticsAccess();
  if (access !== "authorized") {
    const signedOut = access === "signed-out";
    return Response.json({ error: signedOut ? "Unauthorized" : "Forbidden" }, {
      status: signedOut ? 401 : 403, headers,
    });
  }
  const days = reportDays(new URL(request.url).searchParams.get("days"));
  return Response.json(await loadAnalyticsReport(days), { headers });
}
