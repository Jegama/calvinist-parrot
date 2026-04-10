// app/api/user-questions/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  void request;
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !authenticatedUserId) return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const questions = await prisma.questionHistory.findMany({
    where: { userId: authenticatedUserId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(questions);
}
