// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import ChurchFinderPage from "./page";
import { fetchChurchDetail } from "./api";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("./components/church-discovery-panel", () => ({ ChurchDiscoveryPanel: () => null }));
vi.mock("./components/church-map", () => ({ ChurchMap: () => null }));
vi.mock("./components/church-filters", () => ({ ChurchFiltersBar: () => null }));
vi.mock("./components/church-detail-dialog", () => ({
  ChurchDetailDialog: ({ open, church, onOpenChange }: { open: boolean; church: { name: string } | null; onOpenChange: (open: boolean) => void }) =>
    open && church && <button onClick={() => onOpenChange(false)}>Close {church.name}</button>,
}));

it("counts the rendered church and explicit detail selection once across prefetch, pagination, reopen and refresh", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState({ existingState: 42 }, "", "/church-finder");
  const items = Array.from({ length: 11 }, (_, index) => ({
    id: String(index), name: `Church ${index}`, serviceTimes: [], badges: [], denomination: {},
  }));
  const receipts = new Map<string, Set<string>>();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/web/engagement") {
      const body = JSON.parse(String(init?.body));
      expect(Object.keys(body).sort()).toEqual(["feature", "flowId", "step"]);
      expect(body.feature).toBe("church");
      const observed = receipts.get(body.step) ?? new Set<string>();
      observed.add(body.flowId);
      receipts.set(body.step, observed);
      return new Response(null, { status: 204 });
    }
    if (url === "/api/churches/10") return Response.json(items[10]);
    throw new Error(`Unexpected request: ${url}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["churches", "", "", "", "all", "exclude_red_flag_and_limited"], { items, total: items.length });
  client.setQueryData(["churches", "meta"], { states: [], denominations: [] });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ui = <QueryClientProvider client={client}><ChurchFinderPage /></QueryClientProvider>;
  const selectChurch = () => Array.from(host.querySelectorAll("div")).find(el => el.textContent === "Church 10")!.click();
  const next = () => host.querySelector<HTMLButtonElement>('[aria-label="Go to next page"]')!.click();
  try {
    // Loading a record into the cache never emits a web engagement step.
    await client.prefetchQuery({ queryKey: ["church-detail", "10"], queryFn: () => fetchChurchDetail("10") });
    expect(receipts.size).toBe(0);
    await act(async () => root.render(ui));
    const flows = receipts.get("results_viewed");
    expect(flows?.size).toBe(1);
    await act(async () => next());
    expect(receipts.has("detail_opened")).toBe(false);
    const elapsed = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    await act(async () => selectChurch());
    elapsed.mockRestore();
    expect(window.history.state.existingState).toBe(42);
    expect(receipts.get("detail_opened")).toEqual(flows);
    await act(async () => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Close Church 10")!.click());
    await act(async () => selectChurch());
    expect(receipts.get("detail_opened")?.size).toBe(1);
    // A refreshed/shared detail URL restores the dialog with no explicit click.
    await act(async () => root.render(null));
    receipts.clear();
    await act(async () => root.render(ui));
    expect(host.textContent).toContain("Close Church 10");
    expect(receipts.size).toBe(0);
    await act(async () => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Close Church 10")!.click());
    // Next normally re-renders useSearchParams on the URL change.
    await act(async () => root.render(<QueryClientProvider client={client}><ChurchFinderPage /></QueryClientProvider>));
    expect(receipts.get("results_viewed")).toEqual(flows);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
