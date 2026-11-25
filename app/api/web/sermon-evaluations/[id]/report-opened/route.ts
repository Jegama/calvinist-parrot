import { recordEngagement } from "@/lib/analytics/engagement-store";
import prisma from "@/lib/prisma";
import { requireSermonEvaluationAccess } from "@/lib/sermon-evaluation/auth";
import { SERMON_COMPLETE_STATUSES } from "@/lib/sermon-evaluation/types";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId, errorResponse } = await requireSermonEvaluationAccess();
  if (errorResponse || !userId) return errorResponse ?? new Response(null, { status: 401 });
  const { id } = await params;
  const report = await prisma.sermonEvaluation.findFirst({
    where: { id, ownerId: userId, deletedAt: null, status: { in: SERMON_COMPLETE_STATUSES } },
    select: { id: true },
  });
  if (!report) return new Response(null, { status: 404 });
  await recordEngagement("sermon", "report_opened", report.id);
  return new Response(null, { status: 204 });
}
