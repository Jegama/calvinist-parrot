// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeDevotionalReading } from "./reading-time";

describe("devotional reading receipts", () => {
  let stop = () => {};
  const seen = new Set<string>();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const event = JSON.parse(String(init.body));
    expect(event.feature).toBe("daily_devotional");
    seen.add(JSON.stringify([event.step, event.flowId]));
    return new Response(null, { status: 204 });
  });
  function visibility(state: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    document.dispatchEvent(new Event("visibilitychange"));
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    seen.clear();
    fetchMock.mockClear();
    history.replaceState(null, "");
    sessionStorage.clear();
    visibility("visible");
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits until content is visible, pauses in the background, and continues through a refresh", async () => {
    visibility("hidden");
    stop = observeDevotionalReading("today");
    await vi.advanceTimersByTimeAsync(70_000);
    expect(fetchMock).not.toHaveBeenCalled();

    visibility("visible");
    await vi.advanceTimersByTimeAsync(10_000);
    const flowId = JSON.parse(String(fetchMock.mock.calls[0][1].body)).flowId;
    const opened = JSON.stringify(["reading_opened", flowId]);
    expect([...seen]).toEqual([opened]);
    visibility("hidden");
    await vi.advanceTimersByTimeAsync(70_000);
    expect([...seen]).toEqual([opened]);

    window.dispatchEvent(new Event("pagehide"));
    stop();
    stop = observeDevotionalReading("today");
    visibility("visible");
    await vi.advanceTimersByTimeAsync(19_999);
    expect([...seen]).toEqual([opened]);
    await vi.advanceTimersByTimeAsync(1);
    expect([...seen]).toEqual([opened, JSON.stringify(["reading_engaged", flowId])]);

    visibility("hidden");
    visibility("visible");
    await vi.advanceTimersByTimeAsync(60_000);
    const engagementCalls = fetchMock.mock.calls.filter(([, init]) => JSON.parse(String(init.body)).step === "reading_engaged");
    expect(engagementCalls).toHaveLength(1);
  });

  it("recovers a dropped completion on visible refresh using the original view ID", async () => {
    stop = observeDevotionalReading("today");
    const flowId = JSON.parse(String(fetchMock.mock.calls[0][1].body)).flowId;
    const opened = JSON.stringify(["reading_opened", flowId]);
    const engaged = JSON.stringify(["reading_engaged", flowId]);
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect([...seen]).toEqual([opened]);

    visibility("hidden");
    stop();
    stop = observeDevotionalReading("today");
    await vi.advanceTimersByTimeAsync(1);
    expect([...seen]).toEqual([opened]);
    visibility("visible");
    await vi.advanceTimersByTimeAsync(1);
    expect([...seen]).toEqual([opened, engaged]);

    stop();
    stop = observeDevotionalReading("today");
    await vi.advanceTimersByTimeAsync(1);
    expect([...seen]).toEqual([opened, engaged]);
  });

  it("keeps two distinct readings independent and counts an incomplete view only as an open", async () => {
    stop = observeDevotionalReading("yesterday");
    await vi.advanceTimersByTimeAsync(29_000);
    stop();
    stop = observeDevotionalReading("today");
    await vi.advanceTimersByTimeAsync(1_000);
    expect([...seen].map(value => JSON.parse(value)[0])).toEqual(["reading_opened", "reading_opened"]);
  });
});
