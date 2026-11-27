// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FamilySection } from "@/app/prayer-tracker/components/FamilySection";
import { useFamilyManager } from "@/app/prayer-tracker/hooks/use-family-manager";
import type { Family } from "@/app/prayer-tracker/types";

it("searches all directory pages and returns to page one when the query changes", async () => {
  const families: Family[] = Array.from({ length: 21 }, (_, i) => ({
    id: String(i),
    familyName: `Family ${String(i + 1).padStart(2, "0")}`,
    parents: "",
    children: [],
    categoryTag: "Neighbors",
  }));
  families.push({ ...families[20], id: "archived", familyName: "Family 21 archived", archivedAt: "2026-01-01" });
  function Directory() {
    const manager = useFamilyManager({ user: null, families, refreshLists: async () => true });
    return (
      <FamilySection
        {...manager}
        onNewFamilyChange={manager.handleNewFamilyChange}
        onCreateFamily={manager.createFamily}
        onCategoryFilterChange={manager.setCategoryFilter}
        onFamilySearchChange={manager.setFamilySearch}
        onEditFamily={manager.openFamilySheet}
        onViewFamilyDetail={() => {}}
      />
    );
  }

  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const displayedFamilies = () => Array.from(container.querySelectorAll("h4"), (heading) => heading.textContent);
  try {
    await act(async () => root.render(<Directory />));
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(search.labels?.[0].textContent).toBe("Search families");
    expect(search.placeholder).toBe("Search by name");
    const changeSearch = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, value);
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    expect(displayedFamilies()).toHaveLength(10);
    expect(displayedFamilies()).not.toContain("Family 21");
    await changeSearch("ILY 21");
    expect(displayedFamilies()).toEqual(["Family 21"]);

    await changeSearch("");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Go to last page"]')!.click());
    expect(container.textContent).toContain("Page 3 / 3");
    await changeSearch("FAMILY");
    expect(container.textContent).toContain("Page 1 / 3");
    expect(displayedFamilies()[0]).toBe("Family 01");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
