// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { journalResponses } from "@/tests/fixtures/journal-responses";
import JournalPage from "./page";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { $id: "reader" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps saved safety notices and prayer suggestions when a retry disconnects after the overview", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const entry = {
    id: "partial", entryDate: "2026-11-20", entryText: "A saved entry.", tags: [],
    generationStatus: "partial", aiOutput: {
      call1: { ...journalResponses.title, ...journalResponses.scripture, safetyFlags: ["URGENT_MEDICAL_EMERGENCY"] },
      call2: journalResponses.suggestedPrayerRequests,
    },
  };
  const entries = { entries: [entry], page: 1, totalPages: 1, total: 1 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["journal", "entries", "reader", 1, "", []], entries);
  client.setQueryData(["household", "status", "reader"], { hasHousehold: true });
  client.setQueryData(["journal", "focus", "reader"], { entriesAnalyzed: 0 });
  const overview = { ...journalResponses.title, title: "Replayed overview" };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/partial/reprocess")) {
      return new Response(JSON.stringify({ type: "call1a_complete", call1a: overview }) + "\n");
    }
    if (url.startsWith("/api/journal/entries?")) return Response.json(entries);
    throw new Error(`Unexpected request: ${url}`);
  }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><JournalPage /></QueryClientProvider>));
    const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === "Retry");
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    expect(container.textContent).toContain("Generation stopped before it finished");
    expect(container.textContent).toContain("Replayed overview");
    expect(container.textContent).toContain("Possible medical emergency noted");
    expect(container.textContent).toContain(journalResponses.suggestedPrayerRequests.suggestedPrayerRequests[0].title);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    client.clear();
  }
});
