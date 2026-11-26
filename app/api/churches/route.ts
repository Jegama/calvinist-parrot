import { NextResponse } from "next/server";
import { directoryCount, directoryPage } from "@/lib/church-directory";

import prisma from "@/lib/prisma";
import { mapChurchToListItem } from "@/lib/churchMapper";
import { evaluateChurch } from "@/lib/church-evaluation/submit";

const DEFAULT_PAGE_SIZE = 10;

export const maxDuration = 300;

function parseBooleanParam(value: string | null): boolean | null {
  if (value === null) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSizeParam = Number.parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = Number.isNaN(pageSizeParam) || pageSizeParam < 1 ? DEFAULT_PAGE_SIZE : pageSizeParam;

  const filters = {
    city: searchParams.get("city") || undefined,
    state: searchParams.get("state") || undefined,
    denomination: searchParams.get("denomination") || undefined,
    status: searchParams.get("status") || undefined,
    confessional: parseBooleanParam(searchParams.get("confessional")) ?? undefined,
  };
  const [total, rows] = await Promise.all([
    directoryCount(filters), directoryPage(filters, (page - 1) * pageSize, pageSize),
  ]);
  const churches = await prisma.church.findMany({
    where: { id: { in: rows.map(row => row.id) } },
    include: {
      addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }] },
      serviceTimes: { orderBy: { createdAt: "asc" } },
      evaluations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
    },
  });
  const byId = new Map(churches.map(church => [church.id, mapChurchToListItem(church)]));
  const items = rows.flatMap(row => byId.get(row.id) ?? []);
  return NextResponse.json({ page, pageSize, total, items });
}

export function POST(request: Request) {
  return evaluateChurch(request, "public_api");
}
