import React from "react";
import { getEvaluationData } from "./lib";
import { DashboardShell } from "./dashboard-shell";
import { DisableShrinkingHeader } from "./disable-shrinking-header";

export const metadata = {
  title: "AI Model Performance Dashboard | Calvinist Parrot",
  description:
    "Compare AI model scores on 500 theological questions using versioned judge panels, historical prompt comparisons, and transparent judge-agreement diagnostics.",
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
