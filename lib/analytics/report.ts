import { getFeatureReport } from "./features";
import { getAnalyticsMetrics } from "./metrics";
import { getReportingWindow, reportingTimeZone, type ReportingDays, type ReportingWindow } from "./period";
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

export async function loadAnalyticsReport(days: ReportingDays) {
  const now = new Date();
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
