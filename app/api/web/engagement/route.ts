import { z } from "zod";
import { browserSteps, type BrowserFeature } from "@/lib/analytics/engagement-browser-events";
import { recordEngagement } from "@/lib/analytics/engagement-store";
import { checkRateLimit } from "@/lib/rate-limit";

const receipt = z.object({
  feature: z.enum(Object.keys(browserSteps) as [BrowserFeature, ...BrowserFeature[]]),
  step: z.string().max(32),
  flowId: z.uuid(),
}).strict();

export async function POST(request: Request) {
  // Browsers set Fetch Metadata from the actual navigation origin. Behind a
  // reverse proxy the Next.js request URL can have a different internal host.
  const site = request.headers.get("sec-fetch-site");
  const sameOrigin = site ? site === "same-origin" : request.headers.get("origin") === new URL(request.url).origin;
  if (!sameOrigin) {
    return new Response(null, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!checkRateLimit(`engagement:${ip}`, 240, 60_000)) return new Response(null, { status: 429 });
  const parsed = receipt.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { feature, step, flowId } = parsed.data;
  const allowed: readonly string[] = browserSteps[feature];
  if (!allowed.includes(step)) return new Response(null, { status: 400 });
  await recordEngagement(feature, step, flowId);
  return new Response(null, { status: 204 });
}
