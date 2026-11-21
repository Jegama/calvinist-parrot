import { afterEach, describe, expect, it, vi } from "vitest";

import { journalResponses } from "@/tests/fixtures/journal-responses";

vi.mock("@/lib/prisma", () => ({
  default: { providerCallAttempt: { upsert: vi.fn(), update: vi.fn(), create: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@tavily/core", () => ({
  tavily: () => ({ search: async () => ({ results: [] }) }),
}));

import { generateDevotional } from "@/utils/devotionalUtils";
import { generateConversationName } from "@/utils/generateConversationName";
import { runCall1b } from "@/utils/journal/llm";
import { runKidsCall1 } from "@/utils/kids-discipleship/llm";

// Exercise the shared client and SDK with a local generateContent response.
function mockGeminiResponse(output: object) {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      candidates: [{
        content: { role: "model", parts: [{ text: JSON.stringify(output) }] },
        finishReason: "STOP",
      }],
    }),
  );
  vi.stubGlobal("fetch", transport);
  return transport;
}

function expectStructuredHydrogenRequest(transport: ReturnType<typeof mockGeminiResponse>, expectedField: string) {
  expect(transport).toHaveBeenCalledOnce();
  const [url, init] = transport.mock.calls[0];
  expect(new URL(String(url)).pathname).toMatch(/\/models\/gemini-4-hydrogen:generateContent$/);
  const { generationConfig } = JSON.parse(String(init?.body));
  expect(generationConfig.responseMimeType).toBe("application/json");
  expect(generationConfig.responseJsonSchema.properties).toHaveProperty(expectedField);
}

describe("structured generation model routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("routes long Personal and Heritage entries to Haiku with low adaptive thinking", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);
    for (const output of [journalResponses.heartReflection, journalResponses.summary]) {
      transport.mockResolvedValueOnce(Response.json({
        model: "claude-haiku-5-5-fixture",
        content: [{ type: "text", text: JSON.stringify(output) }],
        usage: { input_tokens: 15, output_tokens: 4 },
      }));
    }

    await expect(runCall1b({
      operationId: "personal-fixture",
      entryText: "reflection ".repeat(500),
      situationSummary: "A long journal reflection.",
    })).resolves.toEqual({ output: journalResponses.heartReflection, model: "claude-haiku-5-5-fixture" });
    await expect(runKidsCall1({
      childName: "Sam",
      childAge: "8 years old",
      ageBracket: "MIDDLE_CHILDHOOD",
      characterGoal: null,
      competencyGoal: null,
      category: "NURTURE",
      entryText: "parenting moment ".repeat(500),
      gospelConnection: null,
    }, "heritage-fixture")).resolves.toEqual({ output: journalResponses.summary, model: "claude-haiku-5-5-fixture" });

    expect(transport).toHaveBeenCalledTimes(2);
    for (const [index, field] of ["heartReflection", "gospelConnectionSuggestion"].entries()) {
      const [url, init] = transport.mock.calls[index];
      expect(new URL(String(url)).pathname).toBe("/v1/messages");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "claude-haiku-5-5",
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: { type: "json_schema" } },
      });
      expect(body.output_config.format.schema.properties).toHaveProperty(field);
    }
  });

  it("returns the structured devotional from Hydrogen", async () => {
    const output = { title: "Trust", bible_verse: "Psalm 23:1", devotional: "The Lord is my shepherd." };
    const transport = mockGeminiResponse(output);
    await expect(generateDevotional(new Date("2026-11-15T12:00:00Z"))).resolves.toEqual(output);
    expectStructuredHydrogenRequest(transport, "devotional");
  });

  it("uses the title returned by Hydrogen", async () => {
    const transport = mockGeminiResponse({ name: "Children of God" });
    await expect(generateConversationName("What is adoption?")).resolves.toBe("Children of God");
    expectStructuredHydrogenRequest(transport, "name");
  });
});
