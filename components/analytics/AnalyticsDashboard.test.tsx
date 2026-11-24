import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnalyticsReport } from "@/lib/analytics/report";
import AnalyticsDashboard from "./AnalyticsDashboard";

describe("admin analytics presentation", () => {
  it("keeps available counts, uncovered days, small costs and period changes distinguishable", () => {
    const report: AnalyticsReport = {
      period: {
        days: 7, startDay: "2026-11-12", endDay: "2026-11-18", previousStartDay: "2026-11-05",
        previousEndDay: "2026-11-11", timeZone: "America/Chicago",
      },
      generatedAt: "2026-11-19T08:00:00Z",
      metrics: {
        hero: {
          newChats: { current: 2, previous: 0 }, userMessages: { current: 7, previous: 8 },
          newAccounts: { current: null, previous: null }, averageMessages: { current: 3.5, previous: null },
        },
        channels: [{ channel: "web", newChats: 2, userMessages: 7, activeChats: 2, averageMessages: 3.5 }],
        growth: [
          { day: "2026-11-12", newChats: 0, userMessages: null, newAccounts: null },
          { day: "2026-11-18", newChats: 2, userMessages: 7, newAccounts: null },
        ],
        active: { daily: 1, weekly: 2, monthly: 5 },
        activation: { eligible: null, activated: null, rate: null, firstEligibleDay: null, lastEligibleDay: null, uncovered: null, pending: null },
        integrations: { newChats: 0, userMessages: 0, averageMessages: null, activeChats: 0 },
        guest: { newChats: 0, userMessages: 0, averageMessages: null, activeChats: 0 },
        coverage: { chat: "2026-11-13T10:00:00Z", journal: null, sermon: null, partialChatComparison: true, partialChannels: true, partialActive: true },
        notes: ["Appwrite registrations unavailable."],
      },
      features: {
        rows: [{ key: "personal_journal", name: "Personal Journal", pageviews: null, actions: [{ label: "Saved entries", count: 3 }], estimatedSpendUsd: 0.000032, costPerCompletionUsd: null, spendCoverage: "Partial pricing." }],
        pageviewCoverage: "Vercel pageviews unavailable.", actionCoverage: "Counts reflect retained records.",
      },
    };
    const document = new JSDOM(renderToStaticMarkup(<AnalyticsDashboard report={report} />)).window.document;
    const text = document.body.textContent ?? "";
    expect(document.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/admin/analytics?days=7");
    expect(Array.from(document.querySelectorAll('nav[aria-label="Reporting period"] a'), link => link.getAttribute("href")))
      .toEqual([7, 30, 90, 180, 365, 730].map(days => `/admin/analytics?days=${days}`));
    expect(text).toContain("+2 vs. prior 7 days");
    expect(text).toContain("-1 vs. prior 7 days");
    const link = document.querySelector<HTMLAnchorElement>('header a[href="#data-coverage"]')!;
    expect(document.querySelector(link.hash)?.closest("footer")?.textContent).toContain("Appwrite registrations unavailable.");
    expect(document.querySelector('section[aria-label="Period overview"]')?.textContent).toContain("Registration data unavailable");
    expect(document.getElementById("pageview-coverage")?.textContent).toContain("Vercel pageviews unavailable.");
    expect(text).toContain("Partial pricing.");
    const daily = document.querySelector<HTMLTableSectionElement>("details tbody")!;
    expect(daily.rows[0].cells[2].textContent).toBe("—");
    expect(daily.rows[1].cells[2].textContent).toBe("7");
    const feature = document.querySelector<HTMLTableRowElement>('section[aria-labelledby="features-heading"] tbody tr')!;
    expect(feature.textContent).toContain("Saved entries3");
    expect(feature.textContent).toContain("$0.000032");
    expect(feature.cells[1].textContent).toBe("—");
    expect(feature.cells[4].textContent).toBe("—");
    expect(document.querySelector('section[aria-labelledby="channels-heading"] dl')?.textContent)
      .toContain("Chats started as a guest0Messages sent by guests0Avg. messages per active guest chat—");
  });
});
