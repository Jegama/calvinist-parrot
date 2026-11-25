import type { ModelSpec } from "./parrot-ai";
import { recordUsageAttempt, startUsageAttempt, type UsageAttempt, type UsageContext } from "./provider-usage";

// OpenAI and Anthropic retry below their public SDK methods. The caller records
// the decoded receipt for success; this transport accounts for earlier failures.
export function usageTransport(context: UsageContext, spec: ModelSpec) {
  let attempt: UsageAttempt | undefined;
  let isRetry = context.isRetry;
  async function failed(model?: string, usage?: unknown) {
    if (!attempt) return;
    await recordUsageAttempt(attempt, "provider_error", Date.now() - attempt.startedAt.getTime(), model, usage);
    attempt = undefined;
  }
  return {
    get attempt() { return attempt; },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      attempt = startUsageAttempt({ ...context, isRetry }, spec);
      isRetry = true;
      if (attempt.feature === "chat") await recordUsageAttempt(attempt, "started", 0);
      let response: Response;
      try {
        response = await fetch(input, init);
      } catch (error) {
        await failed();
        throw error;
      }
      if (!response.ok) {
        const envelope = await response.clone().json().catch(() => null);
        const body = envelope?.error?.usage && !envelope.usage ? envelope.error : envelope;
        await failed(typeof body?.model === "string" ? body.model : undefined,
          body?.usage && { ...body.usage, ...(body.service_tier && { service_tier: body.service_tier }) });
      }
      return response;
    },
    async onError(error: unknown): Promise<never> {
      // An unreadable response envelope can fail inside the SDK after HTTP 200.
      await failed();
      throw error;
    },
  };
}
