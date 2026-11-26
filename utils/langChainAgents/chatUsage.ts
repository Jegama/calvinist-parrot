import { randomUUID } from "node:crypto";
import { getConfig } from "@langchain/langgraph";
import { AsyncCaller, type AsyncCallerCallOptions, type AsyncCallerParams } from "@langchain/core/utils/async_caller";
import type { ModelSpec } from "@/lib/parrot-ai";
import { startUsageAttempt, recordUsageAttempt, type UsageContext } from "@/lib/provider-usage";

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

// LangChain's network caller retries request setup before exposing the provider
// stream. Observe each invocation inside its existing retry/backoff boundary.
export class ChatUsageCaller extends AsyncCaller {
  constructor(
    private spec: ModelSpec,
    private stage: "agent" | "ccel_embedding" = "agent",
    options: AsyncCallerParams = {},
    private beforeAttempt?: () => Promise<void>,
  ) {
    super(options);
  }

  override call<Args extends unknown[], Result>(callable: (...args: Args) => Promise<Result>, ...args: Args) {
    return this.callWithOptions({}, callable, ...args);
  }

  override callWithOptions<Args extends unknown[], Result>(
    options: AsyncCallerCallOptions, callable: (...args: Args) => Promise<Result>, ...args: Args
  ): Promise<Result> {
    // A standalone invocation can incur spend without an originating submission.
    const origin = fields(getConfig()?.configurable?.chatUsage);
    const context: UsageContext = {
      feature: "chat", stage: this.stage,
      operationId: typeof origin.operationId === "string" ? origin.operationId : randomUUID(),
    };
    let retry = origin.isRetry === true;
    return super.callWithOptions(options, async () => {
      if (this.beforeAttempt) await this.beforeAttempt();
      const attempt = startUsageAttempt({ ...context, isRetry: retry }, this.spec);
      retry = true;
      return observeProviderCall(attempt, () => callable(...args));
    });
  }
}

async function observeProviderCall<Result>(attempt: ReturnType<typeof startUsageAttempt>, call: () => Promise<Result>) {
  // An abort can win the race before LangChain starts consuming the SDK
  // iterator. Keep an unknown-usage receipt even in that case.
  const started = recordUsageAttempt(attempt, "started", 0);
  let model: string | undefined;
  let usage: Record<string, unknown> = {};
  let completed = false;
  const observe = (value: unknown) => {
    const event = fields(value);
    // Anthropic splits billing between message_start and message_delta.
    // Gemini sends cumulative snapshots. OpenAI sends a terminal response.
    const body = fields(event.response ?? (typeof event.message === "object" ? event.message : event));
    const modelName = body.model ?? body.modelVersion;
    if (typeof modelName === "string") model = modelName;
    const counters = body.usage ?? body.usageMetadata;
    if (counters) {
      usage = { ...usage, ...fields(counters) };
      // message_start reports a provisional output count, even when the
      // provider later generates paid output before the client disconnects.
      if (event.type === "message_start") delete usage.output_tokens;
    }
    if (typeof body.service_tier === "string") usage.service_tier = body.service_tier;
    if (event.type === "message_stop" || event.type === "response.completed") completed = true;
    if (attempt.provider === "gemini" && Array.isArray(body.candidates) &&
      body.candidates.some(candidate => Boolean(fields(candidate).finishReason))) completed = true;
  };
  const observeError = (error: unknown) => {
    observe(error);
    const envelope = fields(error);
    if (envelope.error) observe(envelope.error);
    if (Array.isArray(envelope.errorDetails)) envelope.errorDetails.forEach(observe);
  };
  const persist = async (success: boolean) => {
    const durationMs = Date.now() - attempt.startedAt.getTime();
    await started;
    await recordUsageAttempt(attempt, success ? "success" : "provider_error", durationMs, model, usage);
  };
  try {
    const result = await call();
    if (!result || typeof result !== "object" || !(Symbol.asyncIterator in result)) {
      observe(fields(result).response ?? result);
      if (attempt.stage === "ccel_embedding" && typeof usage.prompt_tokens === "number") {
        // Embeddings produce vectors and have no billable output tokens.
        usage.completion_tokens = 0;
      }
      await persist(true);
      return result;
    }
    // Keep the SDK stream's identity and controller (used for cancellation).
    // Yield the original events and persist one receipt even if the consumer stops.
    const stream = result as AsyncIterable<unknown>;
    const iterator = stream[Symbol.asyncIterator].bind(stream);
    stream[Symbol.asyncIterator] = async function* () {
      let finished = false;
      try {
        for await (const event of { [Symbol.asyncIterator]: iterator }) {
          observe(event);
          yield event;
        }
        // An upstream disconnect can look like ordinary EOF to the SDK.
        // Propagate it before the chat handler saves any partial tokens as a reply.
        if (!completed) throw new Error("The provider stream ended before its final event.");
        finished = true;
      } catch (error) {
        observeError(error);
        throw error;
      } finally {
        if (!completed && attempt.provider === "gemini") {
          // A nonterminal cumulative snapshot cannot price the rest of the
          // interrupted generation. Keep the reported input and partial detail.
          delete usage.candidatesTokenCount;
        }
        await persist(finished);
      }
    };
    return result;
  } catch (error) {
    observeError(error);
    await persist(false);
    throw error;
  }
}
