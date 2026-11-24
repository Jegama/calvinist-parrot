import { getFeatureReport } from "./features";
import { getAnalyticsMetrics } from "./metrics";
import { getReportingWindow, reportingTimeZone } from "./period";
import { getRegistrations } from "./registrations";

export function reportDays(value: unknown): 7 | 30 {
  return value === "30" ? 30 : 7;
}

export async function loadAnalyticsReport(days: 7 | 30) {
  const now = new Date();
  const window = getReportingWindow(days, undefined, now);
  const [metrics, features] = await Promise.all([
    getRegistrations(window.previousStart, window.end)
      .catch(() => null)
      .then(registrations => getAnalyticsMetrics(window, registrations)),
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
      days, startDay: window.startDay, endDay: window.endDay,
      previousStartDay: window.previousStartDay, previousEndDay: window.previousEndDay,
      timeZone: reportingTimeZone,
    },
    generatedAt: now.toISOString(),
    metrics,
    features,
  };
}

export type AnalyticsReport = Awaited<ReturnType<typeof loadAnalyticsReport>>;
