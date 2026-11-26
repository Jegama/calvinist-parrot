import { retrievePublicChurch } from "@/lib/api/handlers/church";
import prisma from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  // A speculative request never delivers a record or populates a browser cache.
  if (request.headers.get("purpose") === "prefetch" ||
      request.headers.get("sec-purpose")?.includes("prefetch") ||
      request.headers.has("next-router-prefetch")) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const { id } = await params;
  return retrievePublicChurch(id, "public_api", request.headers.get("Idempotency-Key"));
}

export async function HEAD(_request: Request, { params }: Context) {
  const { id } = await params;
  const church = await prisma.church.findUnique({ where: { id }, select: { id: true } });
  return new Response(null, { status: church ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
