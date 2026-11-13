// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";

// Keep the real verse loader, but expose its popover without pointer events.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) =>
    createPortal(<div data-testid="verse-popover">{children}</div>, document.body),
}));

it("does not reuse stale verse text or requests when a reference changes at the same offset", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requests = new Map<string, (response: Response) => void>();
  vi.stubGlobal("fetch", vi.fn((url: string) => new Promise<Response>((resolve) => {
    requests.set(url, resolve);
  })));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const popoverText = () => document.querySelector('[data-testid="verse-popover"]')?.textContent;
  const respond = async (path: string, number: number, text: string) => {
    const url = `https://bible.helloao.org/api/BSB/${path}.json`;
    expect([...requests.keys()]).toContain(url);
    await act(async () => {
      requests.get(url)!(Response.json({
        chapter: { content: [{ type: "verse", number, content: [text] }] },
      }));
    });
  };

  try {
    await act(async () => { root.render(<MarkdownWithBibleVerses content="Please read John 3:16." />); });
    await act(async () => { root.render(<MarkdownWithBibleVerses content="Please read Romans 8:1." />); });
    await respond("ROM/8", 1, "Current chapter text");
    expect(popoverText()).toBe("1: Current chapter text");

    await respond("JHN/3", 16, "Stale chapter text");
    expect(popoverText()).toBe("1: Current chapter text");

    await act(async () => { root.render(<MarkdownWithBibleVerses content="Please read Ephesians 2:8." />); });
    expect(popoverText()).toBe("Loading...");
    await respond("EPH/2", 8, "Next chapter text");
    expect(popoverText()).toBe("8: Next chapter text");
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
  }
});
