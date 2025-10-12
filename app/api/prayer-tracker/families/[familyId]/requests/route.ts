import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type RouteContext = { params: Promise<{ familyId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { familyId } = await context.params;
  const items = await prisma.prayerFamilyRequest.findMany({
    where: { familyId, status: { not: "ARCHIVED" } },
    orderBy: [{ dateUpdated: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(request: Request, context: RouteContext) {
  const { familyId } = await context.params;
  const body = await request.json().catch(() => ({}));
  type CreateFamilyRequestPayload = {
    requestText?: string;
    notes?: string | null;
    linkedScripture?: string | null;
  };

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const {
    requestText,
    notes,
    linkedScripture,
  }: CreateFamilyRequestPayload = {
    requestText: typeof payload.requestText === "string" ? payload.requestText : undefined,
    notes:
      typeof payload.notes === "string"
        ? payload.notes
        : payload.notes === null
        ? null
        : undefined,
    linkedScripture:
      typeof payload.linkedScripture === "string"
        ? payload.linkedScripture
        : payload.linkedScripture === null
        ? null
        : undefined,
  };
  if (!requestText)
    return NextResponse.json({ error: "Missing requestText" }, { status: 400 });

  const created = await prisma.prayerFamilyRequest.create({
    data: { familyId, requestText, notes: notes || null, linkedScripture: linkedScripture || null },
  });
  return NextResponse.json(created);
}

