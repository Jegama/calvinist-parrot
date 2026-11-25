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
        registrationIssue: "Set APPWRITE_ANALYTICS_READ_KEY for this deployment and redeploy.",
        hero: {
          newChats: { current: 2, previous: 0 }, userMessages: { current: 7, previous: 8 },
          newAccounts: { current: null, previous: null }, averageMessages: { current: 3.5, previous: null },
        },
        channels: [{ channel: "web", newChats: 2, userMessages: 7, activeChats: 2, averageMessages: 3.5 }],
        growth: [
          { day: "2026-11-12", newChats: 0, userMessages: null, newAccounts: null },
          { day: "2026-11-13", newChats: 1, userMessages: 4, newAccounts: null },
          { day: "2026-11-14", newChats: 1, userMessages: null, newAccounts: null },
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
        evaluationChannels: [
          { feature: "church", channel: "mcp", completions: 0, modelSpend: 0, externalFees: 0, estimatedSpendUsd: 0, costPerCompletionUsd: null, spendCoverage: "0/0 attempts measured." },
        ],
        evaluationStages: [
          { feature: "sermon", preset: "HIGH_CONFIDENCE", stage: "extraction", provider: "gemini", service: "gemini-4-hydrogen", modality: "audio", billingUnit: null, quantity: null, attempts: 2, priced: 1, measured: 1, spend: 0.003 },
        ],
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
    expect(document.querySelector('section[aria-label="Period overview"]')?.textContent).toContain("Set APPWRITE_ANALYTICS_READ_KEY");
    expect(document.getElementById("pageview-coverage")?.textContent).toContain("Vercel pageviews unavailable.");
    expect(text).toContain("Partial pricing.");
    const daily = document.querySelector<HTMLTableSectionElement>("details tbody")!;
    expect(daily.rows[0].cells[2].textContent).toBe("—");
    expect(daily.rows[daily.rows.length - 1].cells[2].textContent).toBe("7");
    const charts = document.querySelectorAll("figure");
    const line = charts[0].querySelector("svg path")?.getAttribute("d");
    expect(line?.match(/L/g)).toHaveLength(3);
    expect(line).toMatch(/^M0\.00 97\.00.*L100\.00 3\.00$/);
    // Missing observations split the line, including isolated known days.
    const brokenLine = charts[1].querySelector("svg path")?.getAttribute("d");
    expect(brokenLine?.match(/M/g)).toHaveLength(2);
    expect(brokenLine).not.toContain("L");
    expect(charts[2].querySelector("svg")).toBeNull();
    expect(document.querySelector('table[aria-label="Church Finder costs by entry channel"] tbody')?.textContent).toContain("MCP0$0.00$0.00$0.00—");
    expect(document.querySelector('table[aria-label="Sermon Evaluator costs by stage"] tbody')?.textContent).toContain("High ConfidenceExtractionGemini · gemini-4-hydrogenAudio$0.0031/2 measured, 1/2 priced");
    const feature = document.querySelector<HTMLTableRowElement>('section[aria-labelledby="features-heading"] tbody tr')!;
    expect(feature.textContent).toContain("Saved entries3");
    expect(feature.textContent).toContain("$0.000032");
    expect(feature.cells[1].textContent).toBe("—");
    expect(feature.cells[4].textContent).toBe("—");
    expect(document.querySelector('section[aria-labelledby="channels-heading"] dl')?.textContent)
      .toContain("Chats started as a guest0Messages sent by guests0Avg. messages per active guest chat—");
  });
});
