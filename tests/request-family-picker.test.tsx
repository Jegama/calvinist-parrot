// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { RequestFamilyPicker } from "@/app/prayer-tracker/components/RequestFamilyPicker";
import type { Family } from "@/app/prayer-tracker/types";

it("keeps an archived link until the user chooses an active match by ID", async () => {
  const families: Family[] = [
    { id: "z", familyName: "Zeller", categoryTag: "Friends" },
    { id: "b1", familyName: "Brown", categoryTag: "Friends" },
    { id: "a", familyName: "adams", categoryTag: "Friends" },
    { id: "b2", familyName: "Brown", categoryTag: null },
    { id: "old", familyName: "Old Brown", categoryTag: "Friends", archivedAt: "2026-01-01" },
    { id: "tag", familyName: "Other Brown", categoryTag: "Archived" },
  ].map((family) => ({ ...family, parents: "", children: [] }));
  const onChange = vi.fn();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const options = () => Array.from(document.querySelectorAll('[role="option"]'), (option) => option.textContent);
  try {
    await act(async () => root.render(<RequestFamilyPicker families={families} value="old" onValueChange={onChange} />));
    const trigger = container.querySelector("button")!;
    expect(trigger.textContent).toBe("Old Brown (archived)");
    await act(async () => trigger.click());
    const search = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    expect(search.labels?.[0].textContent).toBe("Search families");
    expect(options()).toEqual(["Our Family", "adams", "Brown", "Zeller", "Brown"]);
    const changeSearch = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, value);
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await changeSearch("old brown");
    expect(options()).toEqual([]);
    expect(document.querySelector('[role="status"]')?.textContent).toBe("No matching families");
    const clear = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Clear search")!;
    await act(async () => clear.click());
    expect(options()).toEqual(["Our Family", "adams", "Brown", "Zeller", "Brown"]);
    await changeSearch("ROw");
    expect(options()).toEqual(["Brown", "Brown"]);
    const uncategorized = document.querySelector<HTMLElement>('[role="group"][aria-label="Uncategorized"] [role="option"]')!;
    uncategorized.scrollIntoView = vi.fn();
    await act(async () => { search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); });
    expect(search.getAttribute("aria-activedescendant")).toBe(uncategorized.id);
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(onChange.mock.calls).toEqual([["b2"]]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
