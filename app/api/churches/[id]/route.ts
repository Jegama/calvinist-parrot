import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { readChurchDetail } from "@/lib/api/handlers/church";
import { isServerAdminUser } from "@/lib/admin";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteParams) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing church id" }, { status: 400 });
  }

  const church = await readChurchDetail(id);
  if (!church) {
    return NextResponse.json({ error: "Church not found" }, { status: 404 });
  }

  return NextResponse.json(church);
}

export async function DELETE(request: Request, context: RouteParams) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing church id" }, { status: 400 });
  }

  const authenticatedUser = await getAuthenticatedUser();

  if (!isServerAdminUser({ request, user: authenticatedUser })) {
    return NextResponse.json({ error: "Unauthorized: Only admins can delete churches" }, { status: 403 });
  }

  const existing = await prisma.church.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Church not found" }, { status: 404 });
  }

  await prisma.church.delete({ where: { id } });

  return NextResponse.json({ ok: true, id });
}
