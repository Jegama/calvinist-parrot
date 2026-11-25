export const reportingTimeZone = "America/Chicago";
export const reportingPeriods = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
] as const;
export type ReportingDays = (typeof reportingPeriods)[number]["days"];

export function reportDays(value: unknown): ReportingDays {
  return reportingPeriods.find(period => String(period.days) === value)?.days ?? 7;
}

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: reportingTimeZone, year: "numeric", month: "2-digit", day: "2-digit",
});

const hourFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: reportingTimeZone, hourCycle: "h23", hour: "2-digit",
});

export function reportingDay(instant: Date): string {
  return dateFormat.format(instant);
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// At 06:00 UTC Chicago observes either midnight or 01:00. Looking at this
// instant also resolves the correct midnight on both DST transition days.
function midnight(day: string): Date {
  const utc = Date.parse(`${day}T00:00:00Z`);
  const approximate = new Date(utc + 6 * 3_600_000);
  const hour = hourFormat.format(approximate);
  return new Date(approximate.valueOf() - Number(hour) * 3_600_000);
}

export function getReportingWindow(days: ReportingDays, endDay?: string, now = new Date()) {
  const lastCompleteDay = shiftDay(reportingDay(now), -1);
  const day = endDay ?? lastCompleteDay;
  if (!reportingPeriods.some(period => period.days === days) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || shiftDay(day, 0) !== day || day > lastCompleteDay) {
    throw new Error("Choose a supported reporting period ending on a complete Chicago day.");
  }
  const startDay = shiftDay(day, 1 - days);
  const previousStartDay = shiftDay(startDay, -days);
  const start = midnight(startDay);
  return {
    days, startDay, endDay: day, previousStartDay, previousEndDay: shiftDay(startDay, -1),
    start, end: midnight(shiftDay(day, 1)), previousStart: midnight(previousStartDay), previousEnd: start,
    activeStarts: { daily: midnight(day), weekly: midnight(shiftDay(day, -6)), monthly: midnight(shiftDay(day, -29)) },
    now,
  };
}

export type ReportingWindow = ReturnType<typeof getReportingWindow>;
