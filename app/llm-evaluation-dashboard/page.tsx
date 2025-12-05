import React from "react";
import { getEvaluationData } from "./lib";
import { DashboardShell } from "./dashboard-shell";

export const metadata = {
  title: "AI Model Performance Dashboard | Calvinist Parrot",
  description:
    "See which AI models are best at answering theological questions. We tested Google, OpenAI, and xAI across 500+ questions.",
};

export default async function DashboardPage() {
  const data = await getEvaluationData();

  return <DashboardShell data={data} />;
}
