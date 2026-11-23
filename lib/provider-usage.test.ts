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
