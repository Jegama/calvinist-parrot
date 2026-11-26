import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { directoryPage } from "@/lib/church-directory";
import { recordEngagement } from "@/lib/analytics/engagement-store";
import { mapChurchToDetail } from "@/lib/churchMapper";
import prisma from "@/lib/prisma";
import { churchOperationKeySchema, findChurchesInputSchema, findChurchesResultSchema, publicChurchSchema } from "../contracts/church";
import type { ChurchDetail } from "@/types/church";
import { resourceIdSchema } from "../contracts/common";

export async function readChurchDetail(id: string) {
  const church = await prisma.church.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }] },
      serviceTimes: { orderBy: { createdAt: "asc" } },
      evaluations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
    },
  });

  return church ? mapChurchToDetail(church) : null;
}

export async function findChurches(input: z.input<typeof findChurchesInputSchema>) {
  const { page, pageSize, ...filters } = findChurchesInputSchema.parse(input);
  const rows = await directoryPage({ ...filters, evaluatedOnly: true }, (page - 1) * pageSize, pageSize + 1);
  return findChurchesResultSchema.parse({ items: rows.slice(0, pageSize), page, pageSize, hasMore: rows.length > pageSize });
}

function publicRecord(detail: ChurchDetail) {
  const evaluation = detail.evaluation;
  const links = new Set<string>();
  function addLink(value: unknown) {
    if (typeof value === "string" && links.size < 12 && z.httpUrl().safeParse(value).success) links.add(value);
  }
  Object.values(detail.bestPages).forEach(addLink);
  if (Array.isArray(evaluation?.raw.church?.notes)) {
    for (const note of evaluation.raw.church.notes) {
      if (links.size === 12) break;
      addLink(note?.source_url);
    }
  }
  if (Array.isArray(evaluation?.raw.metadata?.source_pages)) {
    for (const source of evaluation.raw.metadata.source_pages) {
      if (links.size === 12) break;
      addLink(source?.resolved_url ?? source?.requested_url);
    }
  }

  return publicChurchSchema.parse({
    ...detail,
    denomination: detail.denomination.label,
    evaluationState: detail.status ? "evaluated" : "unevaluated",
    evaluation: evaluation && {
      ...evaluation, badges: evaluation.badges.slice(0, 25), supportingLinks: [...links],
    },
  });
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

  const record = publicRecord(detail);
  const flowId = createHash("sha256").update(JSON.stringify([record.id, key.data.toLowerCase()])).digest("hex");
  await recordEngagement("church", "record_retrieved", flowId, channel);
  return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
}
