"use client";

import dynamic from "next/dynamic";
import type { EvaluationRecord } from "./lib";

const DashboardClient = dynamic(() => import("./dashboard-client"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen p-4 md:p-8 space-y-4">
      <div className="h-10 w-72 bg-muted animate-pulse rounded" />
      <div className="h-6 w-full max-w-2xl bg-muted animate-pulse rounded" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    </div>
  ),
});

export function DashboardShell({ data }: { data: EvaluationRecord[] }) {
  return <DashboardClient data={data} />;
}
