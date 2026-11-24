import { notFound, redirect } from "next/navigation";
import AnalyticsDashboard from "@/components/analytics/AnalyticsDashboard";
import { analyticsAccess } from "@/lib/analytics/access";
import { loadAnalyticsReport, reportDays } from "@/lib/analytics/report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin analytics", robots: { index: false, follow: false } };

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const access = await analyticsAccess();
  if (access === "signed-out") redirect("/login");
  if (access !== "authorized") notFound();
  const { days } = await searchParams;
  return <AnalyticsDashboard report={await loadAnalyticsReport(reportDays(days))} />;
}
