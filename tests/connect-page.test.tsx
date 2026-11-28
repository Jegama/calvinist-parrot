// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectPage from "@/app/connect/page";

describe("public MCP setup", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<ConnectPage />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("copies the hosted endpoint and a Codex command for that same server", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const endpoint = "https://www.calvinistparrot.com/api/mcp";
    for (const [label, expected] of [
      ["Copy server URL", endpoint],
      ["Copy Codex setup command", `codex mcp add parrot --url ${endpoint}`],
    ]) {
      const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
      await act(async () => button.click());
      expect(writeText).toHaveBeenLastCalledWith(expected);
      expect(button.parentElement?.nextElementSibling?.textContent).toBe("Copied.");
    }
  });

  it("keeps the endpoint selectable if clipboard access is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy server URL"]')!;
    await act(async () => button.click());
    expect(container.querySelector("code")?.textContent).toBe("https://www.calvinistparrot.com/api/mcp");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("copy it manually");
  });
});
