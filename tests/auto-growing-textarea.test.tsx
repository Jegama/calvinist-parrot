// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useAutoGrowingTextarea } from "@/hooks/use-auto-growing-textarea";

it("coalesces input/value/viewport work, shrinks cleared drafts, and cancels on unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  let setDraft!: (value: string) => void;
  function Harness() {
    const [value, setValue] = useState("");
    useEffect(() => { setDraft = setValue; }, []);
    const { textareaRef, handleInput } = useAutoGrowingTextarea(value, { minHeight: 72, maxHeight: 200 });
    return <textarea ref={textareaRef} value={value} onChange={(event) => setValue(event.target.value)} onInput={handleInput} />;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(0)); };
  try {
    await act(async () => { root.render(<Harness />); });
    const textarea = container.querySelector("textarea")!;
    let contentHeight = 300;
    const measure = vi.fn(() => contentHeight);
    Object.defineProperty(textarea, "scrollHeight", { get: measure });
    await act(async () => {
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      setDraft("Long draft");
      window.dispatchEvent(new Event("resize"));
    });
    expect(frames.size).toBe(1);
    flush();
    expect(measure).toHaveBeenCalledTimes(1);
    expect(textarea.style.height).toBe("200px");
    expect(textarea.style.overflowY).toBe("auto");
    contentHeight = 20;
    await act(async () => { setDraft(""); });
    flush();
    expect(textarea.style.height).toBe("72px");
    expect(textarea.style.overflowY).toBe("hidden");
    window.dispatchEvent(new Event("resize"));
    await act(async () => { root.unmount(); });
    expect(frames.size).toBe(0);
  } finally {
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("caches the CSS minimum while typing and refreshes it on resize without losing the draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const readStyle = vi.spyOn(window, "getComputedStyle");
  function Harness() {
    const { textareaRef, handleInput } = useAutoGrowingTextarea("Unsent draft", { maxHeight: 200 });
    return <textarea ref={textareaRef} onInput={handleInput} defaultValue="Unsent draft" style={{ minHeight: 48 }} />;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const flush = () => { const callback = frame; frame = undefined; callback?.(0); };
  try {
    await act(async () => { root.render(<Harness />); });
    const textarea = container.querySelector("textarea")!;
    let contentHeight = 30;
    Object.defineProperty(textarea, "scrollHeight", { get: () => contentHeight });
    flush();
    expect(textarea.style.height).toBe("48px");
    expect(readStyle).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i++) {
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      flush();
    }
    expect(readStyle).toHaveBeenCalledTimes(1);

    textarea.style.minHeight = "72px";
    window.dispatchEvent(new Event("resize"));
    flush();
    expect(textarea.style.height).toBe("72px");
    expect(readStyle).toHaveBeenCalledTimes(2);

    textarea.style.minHeight = "48px";
    contentHeight = 300;
    window.dispatchEvent(new Event("resize"));
    flush();
    expect(textarea.style.height).toBe("200px");
    expect(textarea.style.overflowY).toBe("auto");
    expect(textarea.value).toBe("Unsent draft");
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
