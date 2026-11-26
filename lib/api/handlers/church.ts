import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { recordEngagement } from "@/lib/analytics/engagement-store";
import { mapChurchToDetail } from "@/lib/churchMapper";
import prisma from "@/lib/prisma";
import { churchOperationKeySchema, publicChurchSchema } from "../contracts/church";
import { resourceIdSchema } from "../contracts/common";

export async function readChurchDetail(id: string) {
  const church = await prisma.church.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      serviceTimes: { orderBy: { createdAt: "asc" } },
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return church ? mapChurchToDetail(church) : null;
}

// The public route and MCP adapter supply the channel at their server entry point.
export async function retrievePublicChurch(id: string, channel: "public_api" | "mcp", operationKey: string | null) {
  const churchId = resourceIdSchema.safeParse(id);
  if (!churchId.success) return NextResponse.json({ error: "Invalid church id" }, { status: 400 });
  const key = churchOperationKeySchema.safeParse(operationKey);
  if (!key.success) {
    return NextResponse.json({ error: "Idempotency-Key must be a UUID for this retrieval." }, { status: 400 });
  }

  const detail = await readChurchDetail(churchId.data);
  if (!detail) return NextResponse.json({ error: "Church not found" }, { status: 404 });

  const record = publicChurchSchema.parse(detail);
  const flowId = createHash("sha256").update(JSON.stringify([record.id, key.data.toLowerCase()])).digest("hex");
  await recordEngagement("church", "record_retrieved", flowId, channel);
  return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
}
