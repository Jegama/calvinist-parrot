import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SermonDetailProgress } from "@/components/sermon-evaluation/detail-shell";

describe("sermon detail progress", () => {
  let dom: JSDOM;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(dom.window.document.getElementById("root")!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not persist the completion notice when opening a completed evaluation", async () => {
    await act(async () => {
      root.render(
        <SermonDetailProgress
          status="COMPLETE"
          requestedRuns={3}
          completedRuns={3}
        />,
      );
    });

    expect(dom.window.document.body.textContent).not.toContain(
      "Coaching feedback is ready",
    );
  });

  it("briefly announces completion when an active evaluation finishes", async () => {
    await act(async () => {
      root.render(
        <SermonDetailProgress
          status="SCORING"
          requestedRuns={3}
          completedRuns={2}
        />,
      );
    });

    expect(dom.window.document.body.textContent).toContain(
      "2 of 3 runs complete",
    );

    await act(async () => {
      root.render(
        <SermonDetailProgress
          status="COMPLETE"
          requestedRuns={3}
          completedRuns={3}
        />,
      );
    });

    expect(dom.window.document.body.textContent).toContain(
      "Coaching feedback is ready",
    );

    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });

    expect(dom.window.document.body.textContent).not.toContain(
      "Coaching feedback is ready",
    );
  });
});
