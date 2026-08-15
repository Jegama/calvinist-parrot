import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppwriteUser } from "@/hooks/use-auth";
import type { SermonCapabilities } from "@/components/sermon-evaluation/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import {
  buildPreacherChoices,
  SermonUploadForm,
} from "@/components/sermon-evaluation/upload-form";

const capabilities: SermonCapabilities = {
  hasAccess: true,
  isAdmin: true,
  canChooseCustomRunCount: true,
  dailyQuotaExempt: true,
  allowedRunCountMin: 1,
  allowedRunCountMax: 9,
};

const user = { $id: "local-test-user" } as AppwriteUser;

describe("sermon upload form", () => {
  let dom: JSDOM;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', {
      url: "http://localhost:3000/sermon-evaluation",
      pretendToBeVisual: true,
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Element", dom.window.Element);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("CustomEvent", dom.window.CustomEvent);
    vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
    Object.assign(dom.window.HTMLElement.prototype, {
      attachEvent: () => undefined,
      detachEvent: () => undefined,
    });
    vi.stubGlobal(
      "getComputedStyle",
      dom.window.getComputedStyle.bind(dom.window),
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      dom.window.requestAnimationFrame.bind(dom.window),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      dom.window.cancelAnimationFrame.bind(dom.window),
    );
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(dom.window.document.getElementById("root")!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  async function renderForm() {
    await act(async () => {
      root.render(
        <SermonUploadForm
          capabilities={capabilities}
          user={user}
          preachers={[
            { id: "preacher-1", displayName: "John Calvin" },
            { id: "preacher-2", displayName: "Martin Bucer" },
          ]}
        />,
      );
    });
  }

  async function dropFile(file: File) {
    const dropZone =
      dom.window.document.querySelector<HTMLDivElement>(".border-dashed");
    const dropEvent = new dom.window.Event("drop", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: { files: [file] },
    });

    await act(async () => {
      dropZone?.dispatchEvent(dropEvent);
    });
    return dropZone;
  }

  it("does not let native file validation reject drag-and-drop state", async () => {
    await renderForm();
    const file = new dom.window.File(["sermon audio"], "sermon.mp3", {
      type: "audio/mpeg",
    });
    const dropZone = await dropFile(file);

    const fileInput =
      dom.window.document.querySelector<HTMLInputElement>("#sermon-audio");

    expect(dropZone).not.toBeNull();
    expect(dom.window.document.body.textContent).toContain("sermon.mp3");
    expect(fileInput?.files).toHaveLength(0);
    expect(fileInput).not.toBeNull();
    expect(fileInput?.required).toBe(false);
    expect(fileInput?.getAttribute("aria-required")).toBe("true");
  });

  it("accepts exactly 100 MiB", async () => {
    await renderForm();
    const file = new dom.window.File(["sermon audio"], "boundary.mp3", {
      type: "audio/mpeg",
    });
    Object.defineProperty(file, "size", { value: 104_857_600 });

    await dropFile(file);

    expect(dom.window.document.body.textContent).toContain("boundary.mp3");
    expect(dom.window.document.body.textContent).not.toContain("Audio wasn't added");
  });

  it("shows an oversized-file error next to the audio control", async () => {
    await renderForm();
    const file = new dom.window.File(["sermon audio"], "oversized.mp3", {
      type: "audio/mpeg",
    });
    Object.defineProperty(file, "size", { value: 104_857_601 });

    const dropZone = await dropFile(file);
    const error = dom.window.document.getElementById("sermon-audio-error");
    const title = dom.window.document.getElementById("sermon-title");
    const fileInput =
      dom.window.document.querySelector<HTMLInputElement>("#sermon-audio");

    expect(error?.textContent).toContain("Audio wasn't added");
    expect(error?.textContent).toContain("100 MiB or smaller");
    expect(dropZone?.parentElement?.contains(error)).toBe(true);
    expect(
      error!.compareDocumentPosition(title!) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(fileInput?.getAttribute("aria-invalid")).toBe("true");
    expect(fileInput?.getAttribute("aria-describedby")).toBe("sermon-audio-error");
  });

  it("explains how preacher identity affects dashboard trends", async () => {
    await renderForm();

    expect(
      dom.window.document.getElementById("sermon-preacher-help")?.textContent,
    ).toContain(
      "Select an existing preacher to keep dashboard trends together",
    );
    expect(
      dom.window.document.getElementById("sermon-preacher-help")?.textContent,
    ).toContain("isn't listed");
  });

  it("selects an existing preacher by stable ID", async () => {
    const choices = buildPreacherChoices(
      [
        { id: "preacher-1", displayName: "John Calvin" },
        { id: "preacher-2", displayName: "Martin Bucer" },
      ],
      "  john   calvin ",
    );

    expect(choices).toEqual([
      {
        key: "existing-preacher-1",
        label: "John Calvin",
        selection: {
          kind: "existing",
          preacherId: "preacher-1",
          displayName: "John Calvin",
        },
      },
    ]);
  });

  it("does not create an unmatched preacher until the explicit option is chosen", async () => {
    const choices = buildPreacherChoices(
      [{ id: "preacher-1", displayName: "John Calvin" }],
      " New Pastor ",
    );

    expect(choices).toEqual([
      {
        key: "new-new pastor",
        label: "Create new preacher: “New Pastor”",
        selection: { kind: "new", displayName: "New Pastor" },
      },
    ]);
  });
});
