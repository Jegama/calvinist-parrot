import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type Params = { params: { familyId: string } };

export async function GET(request: Request, { params }: Params) {
  const { familyId } = params;
  const items = await prisma.prayerFamilyRequest.findMany({
    where: { familyId, status: { not: "ARCHIVED" } },
    orderBy: [{ dateUpdated: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(request: Request, { params }: Params) {
  const { familyId } = params;
  const body = await request.json().catch(() => ({}));
  const { requestText, notes, linkedScripture } = body as any;
  if (!requestText)
    return NextResponse.json({ error: "Missing requestText" }, { status: 400 });

  const created = await prisma.prayerFamilyRequest.create({
    data: { familyId, requestText, notes: notes || null, linkedScripture: linkedScripture || null },
  });
  return NextResponse.json(created);
}

