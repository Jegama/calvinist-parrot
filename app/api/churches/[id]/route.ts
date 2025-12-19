import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { mapChurchToDetail } from "@/lib/churchMapper";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteParams) {
  const { id } = await context.params;

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

export async function DELETE(request: Request, context: RouteParams) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing church id" }, { status: 400 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    // allow empty body
  }

  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const adminId = process.env.ADMIN_ID;
  if (!adminId || !userId || userId !== adminId) {
    return NextResponse.json({ error: "Unauthorized: Only admins can delete churches" }, { status: 403 });
  }

  const existing = await prisma.church.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Church not found" }, { status: 404 });
  }

  await prisma.church.delete({ where: { id } });

  return NextResponse.json({ ok: true, id });
}
