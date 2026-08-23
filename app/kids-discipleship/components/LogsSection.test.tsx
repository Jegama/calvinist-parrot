// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LogsSection } from "./LogsSection";

const partialCall1 = {
  summary: "A shepherding summary.",
  whatMightBeGoingOnInTheHeart: ["A desire for approval may be involved."],
  gospelConnectionSuggestion: {
    ageAppropriatePhrase: "Jesus loves us before we perform.",
    scriptureToShare: "Romans 5:8",
    explanation: "Christ loved us while we were sinners.",
  },
  parentShepherdingNextSteps: ["Affirm grace rather than performance."],
  recommendedResources: [
    {
      title: "Parenting: 14 Gospel Principles That Can Radically Change Your Family",
      author: "Paul David Tripp",
      whyItFits: "It helps parents apply gospel grace to everyday shepherding.",
    },
  ],
  scripture: [
    {
      reference: "Romans 5:8",
      whyItApplies: "God's love rests on Christ, not performance.",
    },
  ],
  encouragementForParent: "Keep pointing to Christ's finished work.",
  safetyFlags: [],
};

const partialLog = {
  id: "log-1",
  entryDate: "2026-08-15T12:00:00.000Z",
  entryText: "A saved parenting moment whose second generation call failed.",
  category: "NURTURE" as const,
  gospelConnection: null,
  tags: ["school"],
  createdAt: "2026-08-15T12:00:00.000Z",
  aiOutput: {
    call1: partialCall1,
    call2: null,
  },
};

describe("LogsSection retry recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Provider unavailable" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });
    queryClient.setQueryData(
      ["kids-discipleship", "logs", "child-1"],
      {
        logs: [partialLog],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      }
    );

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LogsSection
            userId="user-1"
            memberId="child-1"
            childName="Sam"
          />
        </QueryClientProvider>
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("restores the saved partial reflection when retry fails", async () => {
    const retryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Retry Reflection")
    );
    expect(retryButton).toBeDefined();

    await act(async () => {
      retryButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Provider unavailable");
    expect(container.textContent).toContain("Shepherding Reflection");
    expect(container.textContent).toContain("Shepherding reflection incomplete");
  });
});
