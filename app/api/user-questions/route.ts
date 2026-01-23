// app/api/user-questions/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(searchParams.get("userId") ?? undefined);
  if (errorResponse || !authenticatedUserId) return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const questions = await prisma.questionHistory.findMany({
    where: { userId: authenticatedUserId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(questions);
}
