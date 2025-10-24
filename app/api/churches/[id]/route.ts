import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { mapChurchToDetail } from "@/lib/churchMapper";

type RouteParams = { params: { id: string } };

export async function GET(_request: Request, context: RouteParams) {
  const { id } = context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing church id" }, { status: 400 });
  }

  const church = await prisma.church.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      serviceTimes: { orderBy: { createdAt: "asc" } },
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!church) {
    return NextResponse.json({ error: "Church not found" }, { status: 404 });
  }

  return NextResponse.json(mapChurchToDetail(church));
}
