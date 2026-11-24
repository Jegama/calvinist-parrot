export const reportingTimeZone = "America/Chicago";
export type ReportingDays = 7 | 30;

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
  if ((days !== 7 && days !== 30) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || shiftDay(day, 0) !== day || day > lastCompleteDay) {
    throw new Error("Choose a complete 7- or 30-day Chicago reporting period.");
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
