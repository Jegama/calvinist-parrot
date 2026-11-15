// @vitest-environment jsdom
import { act, Profiler, useEffect, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));

import { Header } from "@/components/Header";
import { HeaderConfigProvider, useHeaderConfig } from "@/components/providers/header-config-provider";

function Transcript({ disabled }: { disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { setConfig } = useHeaderConfig();
  useEffect(() => {
    setConfig({ scrollContainer: ref.current, disableShrinking: disabled });
    return () => setConfig({ scrollContainer: null, disableShrinking: false });
  }, [disabled, setConfig]);
  return <div ref={ref} data-testid="transcript"><textarea /></div>;
}

const headerCommit = vi.fn();

function Harness({ chat = true, disabled = false }: { chat?: boolean; disabled?: boolean }) {
  return <HeaderConfigProvider><Profiler id="header" onRender={headerCommit}><Header /></Profiler>{chat && <Transcript disabled={disabled} />}</HeaderConfigProvider>;
}

describe("header scroll source", () => {
  let root: Root;
  let container: HTMLDivElement;
  let notifyResize: (entries: ResizeObserverEntry[]) => void;
  let disconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("scrollY", 0);
    headerCommit.mockClear();
    disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: (entries: ResizeObserverEntry[]) => void) { notifyResize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    expect(disconnect).toHaveBeenCalled();
    container.remove();
    document.body.style.removeProperty("--app-header-height");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("follows the transcript, ignores other scrolling, and stays compact until near the top", async () => {
    await act(async () => { root.render(<Harness />); });
    const header = container.querySelector("header")!;
    const row = header.firstElementChild as HTMLElement;
    const transcript = container.querySelector<HTMLElement>('[data-testid="transcript"]')!;
    expect(row.style.height).toBe("3.5rem");

    await act(async () => {
      transcript.scrollTop = 80;
      transcript.querySelector("textarea")!.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    });
    expect(row.style.height).toBe("3.5rem");
    await act(async () => { transcript.dispatchEvent(new Event("scroll")); });
    expect(row.style.height).toBe("2.5rem");
    const more = [...header.querySelectorAll("button")].find((button) => button.textContent === "More")!;
    expect(more.closest('[aria-hidden="true"]')).toBeNull();
    headerCommit.mockClear();
    for (let position = 81; position <= 180; position++) {
      await act(async () => {
        transcript.scrollTop = position;
        transcript.dispatchEvent(new Event("scroll"));
      });
    }
    expect(headerCommit).not.toHaveBeenCalled();

    await act(async () => {
      transcript.scrollTop = 30;
      transcript.dispatchEvent(new Event("scroll"));
    });
    expect(row.style.height).toBe("2.5rem");
    await act(async () => {
      transcript.scrollTop = 0;
      transcript.dispatchEvent(new Event("scroll"));
    });
    expect(row.style.height).toBe("3.5rem");

    const measure = vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ height: 49 } as DOMRect);
    const writeStyle = vi.spyOn(document.body.style, "setProperty");
    const entries = [{ target: header, borderBoxSize: [{ blockSize: 49 }] }] as unknown as ResizeObserverEntry[];
    notifyResize(entries);
    expect(document.body.style.getPropertyValue("--app-header-height")).toBe("49px");
    notifyResize(entries);
    expect(measure).not.toHaveBeenCalled();
    expect(writeStyle).toHaveBeenCalledTimes(1);
  });

  it("honors the disabled setting and returns to window scrolling when chat unmounts", async () => {
    await act(async () => { root.render(<Harness />); });
    const row = container.querySelector("header")!.firstElementChild as HTMLElement;
    const transcript = container.querySelector<HTMLElement>('[data-testid="transcript"]')!;
    await act(async () => {
      transcript.scrollTop = 80;
      transcript.dispatchEvent(new Event("scroll"));
    });
    expect(row.style.height).toBe("2.5rem");
    await act(async () => { root.render(<Harness disabled />); });
    expect(row.style.height).toBe("3.5rem");
    await act(async () => { root.render(<Harness />); });
    expect(row.style.height).toBe("2.5rem");
    await act(async () => { root.render(<Harness chat={false} />); });
    expect(row.style.height).toBe("3.5rem");
    await act(async () => {
      transcript.dispatchEvent(new Event("scroll"));
      vi.stubGlobal("scrollY", 100);
      window.dispatchEvent(new Event("scroll"));
    });
    expect(row.style.height).toBe("1.7rem");
  });
});
