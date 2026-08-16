import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrivateAudioCard } from "@/components/sermon-evaluation/detail-shell";
import { fetchSermonPlaybackAuthorization } from "@/components/sermon-evaluation/api";
import type { SermonEvaluationDetail } from "@/components/sermon-evaluation/types";

vi.mock("@/components/sermon-evaluation/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/sermon-evaluation/api")>();
  return {
    ...original,
    fetchSermonPlaybackAuthorization: vi.fn(),
  };
});

const mockedFetchAuthorization = vi.mocked(fetchSermonPlaybackAuthorization);

function evaluation(): SermonEvaluationDetail {
  return {
    id: "evaluation-1",
    hasRetainedAudio: true,
    durationSeconds: 1_800,
    audio: {
      filename: "sermon.mp3",
      mimeType: "audio/mpeg",
      byteSize: 2_048,
      verified: true,
    },
  } as SermonEvaluationDetail;
}

describe("private sermon audio playback", () => {
  let dom: JSDOM;
  let root: Root;
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  let load: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("HTMLMediaElement", dom.window.HTMLMediaElement);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    load = vi.fn();
    Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
      play: { configurable: true, value: play },
      pause: { configurable: true, value: pause },
      load: { configurable: true, value: load },
    });

    mockedFetchAuthorization.mockReset();
    root = createRoot(dom.window.document.getElementById("root")!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("authorizes and starts playback from one clear action", async () => {
    mockedFetchAuthorization.mockResolvedValue({
      url: "https://private.example/audio?token=do-not-display",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    await act(async () => {
      root.render(<PrivateAudioCard evaluation={evaluation()} />);
    });

    const startButton = Array.from(dom.window.document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Play private audio"),
    );
    expect(startButton).toBeDefined();
    expect(dom.window.document.body.textContent).not.toContain("Authorize playback");

    await act(async () => {
      startButton!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockedFetchAuthorization).toHaveBeenCalledWith("evaluation-1");
    expect(play).toHaveBeenCalledOnce();
    expect(dom.window.document.querySelector("audio[controls]")).not.toBeNull();
    expect(dom.window.document.body.textContent).not.toContain("do-not-display");

    const playbackButton = Array.from(dom.window.document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Play",
    );
    expect(dom.window.document.activeElement).toBe(playbackButton);
  });

  it("returns focusable feedback and allows another attempt when authorization fails", async () => {
    mockedFetchAuthorization.mockRejectedValue(new Error("Playback is temporarily unavailable."));

    await act(async () => {
      root.render(<PrivateAudioCard evaluation={evaluation()} />);
    });

    const startButton = dom.window.document.querySelector("button")!;
    await act(async () => {
      startButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const alert = dom.window.document.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain("Playback is temporarily unavailable.");
    expect(dom.window.document.activeElement).toBe(alert);
    expect(startButton.disabled).toBe(false);
    expect(startButton.textContent).toContain("Play private audio");
  });

  it("refreshes once after a media error and resumes from the prior position", async () => {
    mockedFetchAuthorization
      .mockResolvedValueOnce({
        url: "https://private.example/audio?token=first",
        expiresAt: "2099-01-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        url: "https://private.example/audio?token=second",
        expiresAt: "2099-01-01T00:05:00.000Z",
      });

    await act(async () => {
      root.render(<PrivateAudioCard evaluation={evaluation()} />);
    });
    await act(async () => {
      dom.window.document.querySelector("button")!.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const audio = dom.window.document.querySelector("audio")!;
    audio.currentTime = 42;
    Object.defineProperty(audio, "duration", { configurable: true, value: 100 });

    await act(async () => {
      audio.dispatchEvent(new dom.window.Event("error"));
      await Promise.resolve();
    });

    expect(mockedFetchAuthorization).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledOnce();

    await act(async () => {
      audio.dispatchEvent(new dom.window.Event("loadedmetadata"));
    });

    expect(audio.currentTime).toBe(42);
    expect(play).toHaveBeenCalledTimes(2);
  });
});
