import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ChurchEvaluationTimeoutError,
  runEvaluationStage,
} from "./runtime";

describe("church evaluation runtime budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts and rejects a stage before its deadline", async () => {
    let receivedSignal: AbortSignal | undefined;
    const stage = runEvaluationStage({
      stage: "gemini_core_doctrines",
      deadlineAt: Date.now() + 1_000,
      maxDurationMs: 100,
      operation: (signal) => {
        receivedSignal = signal;
        return new Promise<never>(() => undefined);
      },
    });
    const rejection = expect(stage).rejects.toMatchObject({
      code: "CHURCH_EVALUATION_TIMEOUT",
      stage: "gemini_core_doctrines",
      timeoutMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(receivedSignal?.aborted).toBe(true);
    expect(receivedSignal?.reason).toBeInstanceOf(
      ChurchEvaluationTimeoutError,
    );
  });

  it("uses the remaining total budget when it is shorter than the stage limit", async () => {
    const stage = runEvaluationStage({
      stage: "tavily_enrichment",
      deadlineAt: Date.now() + 25,
      maxDurationMs: 1_000,
      operation: () => new Promise<never>(() => undefined),
    });
    const rejection = expect(stage).rejects.toMatchObject({
      stage: "tavily_enrichment",
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });

  it("logs only safe dimensions for a successful stage", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(runEvaluationStage({
      stage: "tavily_crawl",
      deadlineAt: Date.now() + 1_000,
      maxDurationMs: 100,
      operation: async () => ({ pages: 3 }),
      dimensions: { inputCharacterCount: 900 },
      resultDimensions: (result) => ({
        sourcePageCount: result.pages,
      }),
    })).resolves.toEqual({ pages: 3 });

    expect(info).toHaveBeenCalledWith("church_evaluation_stage", {
      stage: "tavily_crawl",
      status: "success",
      elapsed_ms: 0,
      source_page_count: 3,
      input_character_count: 900,
    });
  });
});
