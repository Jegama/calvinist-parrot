import { describe, expect, it, vi } from "vitest";
import { getAnalyticsMetrics } from "./metrics";
import { getReportingWindow, nextReportingMidnight, reportDays, reportingPeriods, shiftDay } from "./period";

const now = new Date("2026-11-24T05:59:59Z");

describe("Chicago reporting windows", () => {
  it("ends on the last complete local day and compares contiguous equal calendar periods", () => {
    const window = getReportingWindow(30, undefined, now);
    expect(window.endDay).toBe("2026-11-22");
    expect(window.previousEndDay).toBe("2026-10-23");
    expect(window.previousEnd).toEqual(window.start);
    expect(window.end.toISOString()).toBe("2026-11-23T06:00:00.000Z");
  });
  it.each(reportingPeriods.filter(p => p.days !== "all"))("compares two full $days-day windows", ({ days }) => {
    expect(reportDays(String(days))).toBe(days);
    const window = getReportingWindow(days, "2024-03-01", now);
    expect(shiftDay(window.startDay, days - 1)).toBe(window.endDay);
    expect(shiftDay(window.previousStartDay, days)).toBe(window.startDay);
    expect(window.previousEnd).toEqual(window.start);
  });
  it("ends the all-time window at the current instant, including the partial reporting day", () => {
    expect(reportDays("all")).toBe("all");
    const window = getReportingWindow("all", undefined, now);
    expect(window.end).toEqual(now);
    expect(window.endDay).toBe("2026-11-23");
    expect(window.previousStart).toEqual(window.start);
    expect(nextReportingMidnight(now).toISOString()).toBe("2026-11-24T06:00:00.000Z");
    expect(nextReportingMidnight(new Date("2026-03-08T06:01:00Z")).toISOString()).toBe("2026-03-09T05:00:00.000Z");
    expect(nextReportingMidnight(new Date("2026-11-01T05:01:00Z")).toISOString()).toBe("2026-11-02T06:00:00.000Z");
  });
  it("keeps the default for unsupported inputs", () => {
    for (const input of [undefined, ["90"], "99999", "0", "30days"]) expect(reportDays(input)).toBe(7);
  });
  it.each([["2026-03-09", 167], ["2026-11-02", 169]] as const)("spans seven local dates across DST ending %s", (end, hours) => {
    const window = getReportingWindow(7, end, now);
    expect(+window.end - +window.start).toBe(hours * 3_600_000);
    expect(() => getReportingWindow(7, "2026-11-23", now)).toThrow();
  });
});

describe("independent metric availability", () => {
  it("retains account growth when Postgres is unavailable, including zero signup days", async () => {
    const db = { $queryRaw: vi.fn().mockRejectedValue(new Error("offline")) };
    const window = getReportingWindow(7, undefined, now);
    const account = { id: "reader", registeredAt: new Date("2026-11-17T05:56:00Z") };
    const result = await getAnalyticsMetrics(window, [account, account], db);
    expect(result.hero.newAccounts).toEqual({ current: 1, previous: 0 });
    expect(result.growth[0]).toEqual({ day: "2026-11-16", newAccounts: 1, userMessages: null, newChats: null });
    expect(result.growth.at(-1)?.newAccounts).toBe(1);
    expect(result.hero.newChats.current).toBeNull();
    expect(result.active.monthly).toBeNull();
    expect(result.activation.rate).toBeNull();
    expect(result.notes.join(" ")).toContain("unavailable");
  });
  it("includes older-than-two-year and same-day records in all-time totals and the cumulative series", async () => {
    const window = getReportingWindow("all", undefined, now);
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const result = await getAnalyticsMetrics(window, [
      { id: "earliest", registeredAt: new Date("2023-01-01T18:00:00Z") },
      { id: "today", registeredAt: new Date(+now - 1) },
      { id: "after-cutoff", registeredAt: new Date(+now + 1) },
    ], db);
    expect(result.hero.newAccounts).toEqual({ current: 2, previous: null });
    expect(result.growth[0]).toMatchObject({ day: "2023-01-01", newAccounts: 1 });
    expect(result.growth.at(-1)).toMatchObject({ day: "2026-11-23", newAccounts: 2 });
    expect(result.hero.newChats.previous).toBeNull();
  });
  it("distinguishes empty, unavailable and zero-denominator metrics", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const result = await getAnalyticsMetrics(getReportingWindow(7, undefined, now), null, db);
    expect(result.hero.newChats.current).toBe(0);
    expect(result.hero.newAccounts.current).toBeNull();
    expect(result.active.weekly).toBe(0);
    expect(result.guest.averageMessages).toBeNull();
  });
});
