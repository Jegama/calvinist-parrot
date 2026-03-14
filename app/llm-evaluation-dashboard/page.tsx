import React from "react";
import { getEvaluationData } from "./lib";
import { DashboardShell } from "./dashboard-shell";
import { DisableShrinkingHeader } from "./disable-shrinking-header";

export const metadata = {
  title: "AI Model Performance Dashboard | Calvinist Parrot",
  description:
    "See which AI models are best at answering theological questions. We tested Google, OpenAI, xAI, and Anthropic across 500+ questions and multiple prompt versions.",
};

export default async function DashboardPage() {
  const data = await getEvaluationData();

  return (
    <>
      <DisableShrinkingHeader />
      <DashboardShell data={data} />
    </>
  );
}
