import { expect, it } from "vitest";
import { normalizeUsage } from "./provider-usage";

it("separates Gemini cached input, candidate tokens, thinking and tool usage", () => {
  expect(normalizeUsage("gemini", {
    promptTokenCount: 36, candidatesTokenCount: 5, thoughtsTokenCount: 19, totalTokenCount: 60,
  })).toMatchObject({ inputTokens: 36, outputTokens: 24, providerTotalTokens: 60 });

  expect(normalizeUsage("gemini", {
    promptTokenCount: 36, cachedContentTokenCount: 10, candidatesTokenCount: 5,
    thoughtsTokenCount: 19, toolUsePromptTokenCount: 4, totalTokenCount: 64,
  })).toEqual({
    inputTokens: 26, promptTokens: 36, cacheReadTokens: 10, candidateTokens: 5,
    thinkingTokens: 19, outputTokens: 24, toolUsePromptTokens: 4, providerTotalTokens: 64,
    serviceTier: null,
  });
});

it("keeps Claude's base input, TTL splits, and inclusive output", () => {
  expect(normalizeUsage("anthropic", {
    input_tokens: 15, output_tokens: 4, cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0, output_tokens_details: { thinking_tokens: 0 },
  })).toMatchObject({ inputTokens: 15, outputTokens: 4, thinkingTokens: 0 });
  expect(normalizeUsage("anthropic", {
    input_tokens: 15, output_tokens: 47, output_tokens_details: { thinking_tokens: 42 },
    cache_creation_input_tokens: 21, cache_read_input_tokens: 8,
    cache_creation: { ephemeral_5m_input_tokens: 16, ephemeral_1h_input_tokens: 5 },
  })).toEqual({
    inputTokens: 15, outputTokens: 47, thinkingTokens: 42, cacheReadTokens: 8,
    cacheWriteTokens: 21, cacheWrite5mTokens: 16, cacheWrite1hTokens: 5, serviceTier: null,
  });
});

it("keeps unknown usage and optional provider counters distinct from measured zero", () => {
  expect(normalizeUsage("anthropic", undefined)).toMatchObject({
    inputTokens: null, outputTokens: null, cacheWrite5mTokens: null, thinkingTokens: null,
  });
  expect(normalizeUsage("gemini", { thoughtsTokenCount: 5 })).toMatchObject({
    inputTokens: null, outputTokens: null, thinkingTokens: 5, candidateTokens: null,
  });
  expect(normalizeUsage("gemini", { candidatesTokenCount: 0, promptTokenCount: 12 })).toMatchObject({
    inputTokens: 12, outputTokens: 0, cacheReadTokens: null, thinkingTokens: null,
  });
});

it("withholds an estimate if the Gemini total proves a missing billable component", () => {
  expect(normalizeUsage("gemini", { promptTokenCount: 36, candidatesTokenCount: 5, totalTokenCount: 60 }))
    .toMatchObject({ inputTokens: 36, candidateTokens: 5, outputTokens: null, providerTotalTokens: 60 });
});

it("normalizes OpenAI Responses and Chat Completions without double charging cached input or reasoning", () => {
  expect(normalizeUsage("openai", {
    input_tokens: 100, output_tokens: 30, total_tokens: 130, service_tier: "default",
    input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10, cache_write_tokens_details: { ttl_30m_tokens: 6, ttl_12h_tokens: 4 } },
    output_tokens_details: { reasoning_tokens: 14 },
  })).toMatchObject({ inputTokens: 70, cacheReadTokens: 20, cacheWriteTokens: 10, cacheWrite30mTokens: 6, cacheWrite12hTokens: 4, outputTokens: 30, thinkingTokens: 14, serviceTier: "default" });
  expect(normalizeUsage("openai", {
    prompt_tokens: 50, completion_tokens: 5, total_tokens: 55,
    prompt_tokens_details: { cached_tokens: 8, cache_write_tokens: 5, cache_write_tokens_details: { ttl_30m_tokens: 2, ttl_12h_tokens: 3 } },
  })).toMatchObject({ inputTokens: 37, cacheReadTokens: 8, cacheWriteTokens: 5, cacheWrite30mTokens: 2, cacheWrite12hTokens: 3, outputTokens: 5 });
  expect(normalizeUsage("openai", { prompt_tokens: 50 })).toMatchObject({ inputTokens: 50, outputTokens: null, cacheWrite30mTokens: null, cacheWrite12hTokens: null });
});
