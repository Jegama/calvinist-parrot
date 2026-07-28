export const EVALUATION_UPSTREAM_BUDGET_MS = 240_000;
export const TAVILY_CRAWL_STAGE_TIMEOUT_MS = 80_000;
export const TAVILY_ENRICHMENT_STAGE_TIMEOUT_MS = 40_000;
export const GEMINI_STAGE_TIMEOUT_MS = 55_000;

export type EvaluationStageDimensions = {
  sourcePageCount?: number;
  inputCharacterCount?: number;
};

type EvaluationStageStatus = "success" | "error" | "timeout";

export class ChurchEvaluationTimeoutError extends Error {
  readonly code = "CHURCH_EVALUATION_TIMEOUT";

  constructor(
    readonly stage: string,
    readonly timeoutMs: number,
  ) {
    super(`Church evaluation timed out during ${stage}.`);
    this.name = "ChurchEvaluationTimeoutError";
  }
}

export class ChurchEvaluationUpstreamError extends Error {
  readonly code = "CHURCH_EVALUATION_UPSTREAM_ERROR";

  constructor(
    readonly provider: "gemini" | "tavily",
    readonly stage: string,
    options?: ErrorOptions,
  ) {
    super(`Church evaluation upstream request failed during ${stage}.`, options);
    this.name = "ChurchEvaluationUpstreamError";
  }
}

export function createEvaluationDeadline(
  budgetMs = EVALUATION_UPSTREAM_BUDGET_MS,
): number {
  return Date.now() + budgetMs;
}

export function logEvaluationStage({
  stage,
  status,
  startedAt,
  dimensions = {},
  error,
}: {
  stage: string;
  status: EvaluationStageStatus;
  startedAt: number;
  dimensions?: EvaluationStageDimensions;
  error?: unknown;
}): void {
  console.info("church_evaluation_stage", {
    stage,
    status,
    elapsed_ms: Math.max(0, Date.now() - startedAt),
    ...(dimensions.sourcePageCount === undefined
      ? {}
      : { source_page_count: dimensions.sourcePageCount }),
    ...(dimensions.inputCharacterCount === undefined
      ? {}
      : { input_character_count: dimensions.inputCharacterCount }),
    ...(error instanceof Error ? { error_name: error.name } : {}),
  });
}

export async function measureEvaluationStage<T>({
  stage,
  operation,
  dimensions,
  resultDimensions,
}: {
  stage: string;
  operation: () => T | Promise<T>;
  dimensions?: EvaluationStageDimensions;
  resultDimensions?: (result: T) => EvaluationStageDimensions;
}): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await operation();
    logEvaluationStage({
      stage,
      status: "success",
      startedAt,
      dimensions: {
        ...dimensions,
        ...resultDimensions?.(result),
      },
    });
    return result;
  } catch (error) {
    logEvaluationStage({
      stage,
      status: "error",
      startedAt,
      dimensions,
      error,
    });
    throw error;
  }
}

export async function runEvaluationStage<T>({
  stage,
  deadlineAt,
  maxDurationMs,
  operation,
  dimensions,
  resultDimensions,
}: {
  stage: string;
  deadlineAt: number;
  maxDurationMs: number;
  operation: (signal: AbortSignal) => Promise<T>;
  dimensions?: EvaluationStageDimensions;
  resultDimensions?: (result: T) => EvaluationStageDimensions;
}): Promise<T> {
  const startedAt = Date.now();
  const timeoutMs = Math.min(
    maxDurationMs,
    Math.max(0, deadlineAt - startedAt),
  );

  if (timeoutMs === 0) {
    const error = new ChurchEvaluationTimeoutError(stage, timeoutMs);
    logEvaluationStage({
      stage,
      status: "timeout",
      startedAt,
      dimensions,
      error,
    });
    throw error;
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new ChurchEvaluationTimeoutError(stage, timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      operation(controller.signal),
      timeoutPromise,
    ]);
    logEvaluationStage({
      stage,
      status: "success",
      startedAt,
      dimensions: {
        ...dimensions,
        ...resultDimensions?.(result),
      },
    });
    return result;
  } catch (error) {
    const normalizedError = controller.signal.aborted &&
        controller.signal.reason instanceof ChurchEvaluationTimeoutError
      ? controller.signal.reason
      : error;
    logEvaluationStage({
      stage,
      status: normalizedError instanceof ChurchEvaluationTimeoutError
        ? "timeout"
        : "error",
      startedAt,
      dimensions,
      error: normalizedError,
    });
    throw normalizedError;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
