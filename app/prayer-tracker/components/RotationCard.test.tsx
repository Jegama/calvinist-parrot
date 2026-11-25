// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { RotationCard } from "./RotationCard";
import type { Rotation } from "../types";
import { trackEngagement } from "@/lib/analytics/engagement-client";

vi.mock("@/lib/analytics/engagement-client", () => ({ trackEngagement: vi.fn(async () => {}) }));
vi.mock("@/components/BibleVerse", () => ({ BibleVerse: () => null }));

it("observes a prepared rotation when the card becomes visible and confirms that same view", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onConfirmRotation = vi.fn();
  const flowId = crypto.randomUUID();
  function render(rotation: Rotation | null) {
    return act(async () => root.render(
      <RotationCard rotation={rotation} members={[]} personalSelections={{}} familyAssignments={{}}
        isConfirming={false} hasSelections={true} onFamilyAssignmentChange={vi.fn()}
        onPersonalSelectionChange={vi.fn()} onCancelRotation={vi.fn()} onConfirmRotation={onConfirmRotation} />
    ));
  }
  try {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await render(null);
    expect(trackEngagement).not.toHaveBeenCalled();
    await render({ flowId, families: [], personal: [] });
    expect(trackEngagement).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(trackEngagement).toHaveBeenCalledExactlyOnceWith("prayer", "rotation_shown", flowId);
    const confirm = [...container.querySelectorAll("button")].find(button => button.textContent === "Mark as Prayed");
    confirm!.click();
    expect(onConfirmRotation).toHaveBeenCalledExactlyOnceWith(vi.mocked(trackEngagement).mock.results[0].value);
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(document, "visibilityState");
    vi.unstubAllGlobals();
  }
});
