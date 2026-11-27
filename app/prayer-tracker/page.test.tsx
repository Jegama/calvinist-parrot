// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import PrayerTrackerPage from "./page";

vi.mock("@/hooks/use-auth", () => {
  const session = { user: { $id: "viewer" }, loading: false };
  return { useAuth: () => session };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/BibleVerse", () => ({ BibleVerse: () => null }));

it("keeps an edited rotation open on a rename and invalidates it after a household change", async () => {
  let unavailable: string | null = "/api/prayer-tracker/spaces";
  let name = "Helene";
  let version = "first";
  const family = { id: "family", familyName: "Jones", children: [], lastPrayedBy: { id: "partner", displayName: name } };
  const fetchFixture = vi.fn(async (path: string) => {
    if (unavailable === path) return new Response(null, { status: 503 });
    const members = [{ id: "partner", displayName: name, role: "OWNER" }];
    switch (path) {
      case "/api/prayer-tracker/sync": return Response.json({ spaceId: "space", version, nameVersion: name });
      case "/api/prayer-tracker/spaces": return Response.json({ space: { spaceName: "Household", members } });
      case "/api/prayer-tracker/rotation": return Response.json({
        members, families: [family], personal: [{ id: "request", requestText: "Pray for us" }], assignments: { family: "partner" },
      });
      case "/api/prayer-tracker/requests": return Response.json([]);
      case "/api/prayer-tracker/families": return Response.json([family]);
      case "/api/prayer-tracker/overview": return Response.json({ hasHousehold: true, stats: null });
      default: throw new Error(`Unexpected request: ${path}`);
    }
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchFixture);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const client = new QueryClient();
  const selection = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><PrayerTrackerPage /></QueryClientProvider>));
    expect(fetchFixture).toHaveBeenCalledWith("/api/prayer-tracker/sync", expect.any(Object));
    expect(container.textContent).toContain("Couldn’t load your household");
    expect(container.textContent).not.toContain("No Household Found");
    unavailable = null;
    await act(async () => window.dispatchEvent(new Event("focus")));
    const prepare = [...container.querySelectorAll("button")].find(button => button.textContent === "Prepare Tonight's Rotation");
    await act(async () => prepare!.click());
    expect(selection()?.checked).toBe(true);
    await act(async () => selection()!.click());
    expect(selection()?.checked).toBe(false);

    name = "Hélène";
    unavailable = "/api/prayer-tracker/spaces";
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(selection()?.checked).toBe(false);
    expect(container.querySelector('[role="combobox"]')?.textContent).toContain("Helene");
    // Each partial failure must keep the same version eligible for another poll.
    for (const path of ["/api/prayer-tracker/families", "/api/prayer-tracker/requests"]) {
      unavailable = path;
      const previousCalls = fetchFixture.mock.calls.filter(([url]) => url === path).length;
      await act(async () => window.dispatchEvent(new Event("focus")));
      expect(fetchFixture.mock.calls.filter(([url]) => url === path)).toHaveLength(previousCalls + 1);
    }
    unavailable = null;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(selection()?.checked).toBe(false);
    expect(container.textContent).toContain("by Hélène");
    expect(container.querySelector('[role="combobox"]')?.textContent).toContain("Hélène");
    expect(fetchFixture.mock.calls.filter(([path]) => path === "/api/prayer-tracker/rotation")).toHaveLength(1);

    version = "new prayer";
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(selection()).toBeNull();
    expect(container.textContent).not.toContain("Family Intercession");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    client.clear();
    Reflect.deleteProperty(document, "visibilityState");
    vi.unstubAllGlobals();
  }
});
