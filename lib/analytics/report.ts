import { unstable_cache } from "next/cache";
import { getFeatureReport } from "./features";
import { getAnalyticsMetrics } from "./metrics";
import { getReportingWindow, reportingDay, reportingTimeZone, type ReportingDays, type ReportingWindow } from "./period";
import { getRegistrations, RegistrationSourceError, type AccountRegistration } from "./registrations";

async function loadMetrics(window: ReportingWindow) {
  let registrations: AccountRegistration[] | null = null;
  let registrationIssue: string | null = null;
  try {
    registrations = await getRegistrations(window.previousStart, window.end);
  } catch (error) {
    registrationIssue = error instanceof RegistrationSourceError ? error.message : "Appwrite registrations are temporarily unavailable.";
  }
  const metrics = await getAnalyticsMetrics(window, registrations);
  return { ...metrics, registrationIssue };
}

async function buildAnalyticsReport(days: ReportingDays, now: Date) {
  const window = getReportingWindow(days, undefined, now);
  const [metrics, features] = await Promise.all([
    loadMetrics(window),
    getFeatureReport(window),
  ]);
  const website = metrics.channels.find(row => row.channel === "web");
  for (const row of features.rows) {
    if (row.key === "chat") {
      row.actions.push({ label: "Website messages submitted", count: website?.userMessages ?? null });
    }
    if (row.key === "account") {
      row.actions.push({ label: "Registrations", count: metrics.hero.newAccounts.current });
    }
  }
  return {
    period: {
      days, startDay: days === "all" ? null : window.startDay, endDay: window.endDay,
      previousStartDay: days === "all" ? null : window.previousStartDay,
      previousEndDay: days === "all" ? null : window.previousEndDay,
      timeZone: reportingTimeZone,
    },
    generatedAt: now.toISOString(),
    metrics,
    features,
  };
}

export const analyticsReportTag = "admin-analytics-snapshots";

export function loadAnalyticsReport(days: ReportingDays) {
  const now = new Date();
  // Only aggregate results are shared. The page, API, and refresh action each
  // authorize the current session outside the cache on every request.
  return unstable_cache(
    () => buildAnalyticsReport(days, now),
    [analyticsReportTag, process.env.VERCEL_DEPLOYMENT_ID ?? "local", reportingDay(now), String(days)],
    { tags: [analyticsReportTag], revalidate: 25 * 3600 },
  )();
}

export type AnalyticsReport = Awaited<ReturnType<typeof loadAnalyticsReport>>;
