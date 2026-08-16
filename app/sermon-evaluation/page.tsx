import type { Metadata } from "next";
import { SermonEvaluationFeature } from "@/components/sermon-evaluation/feature-shell";

export const metadata: Metadata = {
  title: "Sermon Evaluation | Calvinist Parrot",
  description: "Private, structured sermon coaching feedback with rubric detail and preached-date analytics.",
};

export default function SermonEvaluationPage() {
  return <SermonEvaluationFeature />;
}

