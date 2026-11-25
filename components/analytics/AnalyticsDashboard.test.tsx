import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AnalyticsReport } from "@/lib/analytics/report";
import AnalyticsDashboard from "./AnalyticsDashboard";
import FeatureTable from "./FeatureTable";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/analytics/actions", () => ({ refreshAnalytics: vi.fn() }));

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
        chatSpend: null,
        rows: [{ key: "personal_journal", name: "Personal Journal", pageviews: null, actions: [{ label: "Saved entries", count: 3 }], estimatedSpendUsd: 0.000032, costPerCompletionUsd: null, spendCoverage: "Partial pricing." }],
        pageviewCoverage: "Vercel pageviews unavailable.", actionCoverage: "Counts reflect retained records.",
      },
    };
    const document = new JSDOM(renderToStaticMarkup(<AnalyticsDashboard report={report} />)).window.document;
    const text = document.body.textContent ?? "";
    expect(document.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/admin/analytics?days=7");
    expect(Array.from(document.querySelectorAll('nav[aria-label="Reporting period"] a'), link => link.getAttribute("href")))
      .toEqual([7, 30, 90, 180, 365, 730, "all"].map(days => `/admin/analytics?days=${days}`));
    expect(document.querySelector('button[type="submit"]')?.textContent).toBe("Refresh");
    const lifetime = new JSDOM(renderToStaticMarkup(<AnalyticsDashboard report={{
      ...report, period: { ...report.period, days: "all", startDay: null, previousStartDay: null, previousEndDay: null },
    }} />)).window.document;
    expect(lifetime.querySelector('[aria-current="page"]')?.textContent).toBe("All time");
    expect(lifetime.querySelector("header")?.textContent).toContain("Through Nov 19, 2026");
    expect(lifetime.body.textContent).not.toContain("vs. prior");
    expect(text).toContain("+2 vs. prior 7 days");
    expect(text).toContain("-1 vs. prior 7 days");
    const link = document.querySelector<HTMLAnchorElement>('header a[href="#data-coverage"]')!;
    expect(document.querySelector(link.hash)?.closest("footer")?.textContent).toContain("Appwrite registrations unavailable.");
    expect(document.querySelector('section[aria-label="Period overview"]')?.textContent).toContain("Set APPWRITE_ANALYTICS_READ_KEY");
    expect(document.getElementById("pageview-coverage")?.textContent).toContain("Vercel pageviews unavailable.");
    expect(text).toContain("Partial pricing.");
    expect(document.querySelector("details summary")?.textContent).toBe("Daily cumulative totals");
    expect(document.querySelector("details table")).toBeNull();
    const charts = document.querySelectorAll("figure");
    const line = charts[0].querySelector("svg path")?.getAttribute("d");
    expect(line?.match(/L/g)).toHaveLength(3);
    expect(line).toMatch(/^M0\.00 97\.00.*L100\.00 3\.00$/);
    // Missing observations split the line, including isolated known days.
    const brokenLine = charts[1].querySelector("svg path")?.getAttribute("d");
    expect(brokenLine?.match(/M/g)).toHaveLength(2);
    expect(brokenLine).not.toContain("L");
    expect(charts[2].querySelector("svg")).toBeNull();
    const feature = document.querySelector<HTMLTableRowElement>('section[aria-labelledby="features-heading"] tbody tr')!;
    expect(feature.textContent).toContain("Saved entries3");
    expect(feature.textContent).toContain("$0.000032");
    expect(feature.cells[1].textContent).toBe("—");
    expect(feature.cells[5].textContent).toBe("—");
    expect(document.querySelector('section[aria-labelledby="channels-heading"] dl')?.textContent)
      .toContain("Chats started as a guest0Messages sent by guests0Avg. messages per active guest chat—");
  });

  it("keeps matched website steps, independent counts, and server outcomes distinct in each feature view", () => {
    const period: AnalyticsReport["period"] = {
      days: 7, startDay: "2026-11-15", endDay: "2026-11-21", previousStartDay: "2026-11-08",
      previousEndDay: "2026-11-14", timeZone: "America/Chicago",
    };
    const defaults = { pageviews: 15, actions: [], estimatedSpendUsd: null, costPerCompletionUsd: null, spendCoverage: "Unavailable." };
    const features: AnalyticsReport["features"] = {
      rows: [
        { ...defaults, name: "Parrot Chat", key: "chat", engagement: {
          steps: [
            { label: "First messages sent", count: 2 },
            { label: "Visible replies received", count: 1, denominator: 2, denominatorLabel: "First messages sent" },
            { label: "Follow-ups sent", count: 0, denominator: 1, denominatorLabel: "Visible replies received" },
          ],
          external: [{ label: "Direct API · answers returned", count: 1 }, { label: "MCP · answers returned", count: 1 }],
          coverage: "Partial coverage since Nov 17, 2026.",
        } },
        { ...defaults, name: "Prayer Tracker", key: "prayer", engagement: {
          steps: [
            { label: "Rotations shown", count: 0 },
            { label: "Rotations confirmed", count: 0, denominator: 0, denominatorLabel: "Rotations shown" },
            { label: "Requests marked answered", count: 3 },
          ], coverage: "Collection started Nov 15, 2026.",
        } },
        { ...defaults, name: "Personal Journal", key: "personal_journal", engagement: {
          steps: [{ label: "Reflections ready", count: 4, denominator: null }], coverage: "Start count unavailable.",
        } },
      ],
      chatSpend: null, pageviewCoverage: "Anonymous reach.", actionCoverage: "Saved actions available.",
    };

    const generatedAt = "2026-11-22T09:00:00Z";
    const doc = new JSDOM(renderToStaticMarkup(<FeatureTable features={features} period={period} generatedAt={generatedAt} />)).window.document;
    const allTime = { ...period, days: "all" as const, startDay: null, endDay: "2026-11-22", previousStartDay: null, previousEndDay: null };
    const lifetime = new JSDOM(renderToStaticMarkup(<FeatureTable features={features} period={allTime} generatedAt={generatedAt} />)).window.document;
    expect(lifetime.querySelector("#outcomes-chat")?.textContent).toContain("All time through Nov 22, 2026, 3:00 AM CST");
    const overview = doc.querySelector<HTMLTableElement>("table")!;
    const websiteCounts = overview.rows[1].cells[3].textContent;
    expect(websiteCounts).toBe("First messages sent2Visible replies received1Follow-ups sent0");
    expect(overview.rows[1].cells[1].textContent).toBe("15");

    const link = overview.rows[1].querySelector("a")!;
    const chat = doc.querySelector(link.hash)!;
    expect(chat.closest("details")?.querySelector("summary")?.textContent).toBe("Parrot Chat");
    expect(chat.textContent).toContain("Nov 15, 2026 – Nov 21, 2026 · America/Chicago");
    expect(chat.textContent).toContain("Partial coverage since Nov 17, 2026.");
    expect(chat.querySelector("table")?.textContent).not.toContain("answers returned");
    expect(chat.querySelector("tbody")?.rows[1].cells[2].textContent).toBe("50%1 of 2 · First messages sent");
    expect(chat.querySelector("tbody")?.rows[2].cells[2].textContent).toBe("0%0 of 1 · Visible replies received");
    expect(chat.querySelector("dl")?.textContent).toBe("Direct API · answers returned1MCP · answers returned1");

    const prayer = doc.querySelector("#outcomes-prayer tbody")!;
    expect(prayer.children[1].textContent).toContain("—0 of 0 · Rotations shown");
    expect(prayer.children[2].textContent).toBe("Requests marked answered3Count only");
    expect(doc.querySelector("#outcomes-personal_journal tbody")?.textContent).toBe("Reflections ready4Denominator unavailable");
  });
});
