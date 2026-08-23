import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { $id: "owner-1", labels: ["sermonevaluatorbeta"] },
    loading: false,
  }),
}));

vi.mock("@/components/ProtectedView", () => ({
  ProtectedView: ({ children }: { children: React.ReactNode }) => children,
}));

import { SermonEvaluationDetailFeature } from "@/components/sermon-evaluation/detail-shell";
import type {
  SermonEvaluationDetail,
  SermonStatus,
} from "@/components/sermon-evaluation/types";

function evaluation(
  status: SermonStatus,
  pointer: Partial<
    Pick<
      SermonEvaluationDetail,
      "canonicalEvaluationId" | "canonicalDetailUrl"
    >
  > = {},
): SermonEvaluationDetail {
  return {
    id: "provisional-evaluation",
    status,
    reportRegenerationPending: false,
    ...pointer,
  } as SermonEvaluationDetail;
}

describe("canonical evaluation navigation", () => {
  let dom: JSDOM;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', {
      url: "https://www.calvinistparrot.com/sermon-evaluation/provisional-evaluation",
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.replace.mockReset();
    mocks.useQuery.mockImplementation(
      ({ queryKey }: { queryKey: unknown[] }) => {
        if (queryKey[1] === "capabilities") {
          return {
            data: { hasAccess: true },
            isPending: false,
            isError: false,
            refetch: vi.fn(),
          };
        }
        if (queryKey[2] === "status") {
          return {
            data: evaluation("FAILED", {
              canonicalEvaluationId: "canonical-evaluation",
              canonicalDetailUrl:
                "/sermon-evaluation/canonical-evaluation",
            }),
            isPending: false,
            isError: false,
            refetch: vi.fn(),
          };
        }
        return {
          data: evaluation("SCORING"),
          isPending: false,
          isError: false,
          refetch: vi.fn(),
        };
      },
    );
    root = createRoot(dom.window.document.getElementById("root")!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("replaces the provisional route when status polling finds its canonical evaluation", async () => {
    await act(async () => {
      root.render(
        <SermonEvaluationDetailFeature
          evaluationId="provisional-evaluation"
        />,
      );
    });

    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith(
      "/sermon-evaluation/canonical-evaluation?notice=duplicate",
    );
  });
});
