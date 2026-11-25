// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import GrowthCharts from "./GrowthCharts";

it("mounts the daily rows only when the native disclosure is open", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const growth = [
    { day: "2026-11-01", newChats: 2, userMessages: null, newAccounts: 1 },
    { day: "2026-11-02", newChats: 3, userMessages: 7, newAccounts: 1 },
  ];
  try {
    await act(() => root.render(<GrowthCharts growth={growth} chatCoverage={null} endDay="2026-11-02" timeZone="America/Chicago" />));
    const disclosure = container.querySelector("details")!;
    expect(disclosure.querySelector("table")).toBeNull();
    await act(() => {
      disclosure.open = true;
      disclosure.dispatchEvent(new Event("toggle"));
    });
    const rows = disclosure.querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].cells[2].textContent).toBe("—");
    expect(rows[1].cells[2].textContent).toBe("7");
    await act(() => {
      disclosure.open = false;
      disclosure.dispatchEvent(new Event("toggle"));
    });
    expect(disclosure.querySelector("table")).toBeNull();
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
