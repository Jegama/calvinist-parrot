import type { Metadata } from "next";
import { SermonEvaluationDetailFeature } from "@/components/sermon-evaluation/detail-shell";

export const metadata: Metadata = {
  title: "Sermon Evaluation Detail | Calvinist Parrot",
  description: "Private sermon coaching feedback, rubric detail, audio, reports, and evaluation history.",
};

export default async function SermonEvaluationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ evaluationId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ evaluationId }, query] = await Promise.all([params, searchParams]);
  const notice = query.notice === "duplicate" || query.notice === "reattach" ? query.notice : undefined;
  return <SermonEvaluationDetailFeature evaluationId={evaluationId} notice={notice} />;
}

