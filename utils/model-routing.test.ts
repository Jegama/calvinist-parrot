import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));
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

  it("uses Hydrogen for a long journal reflection", async () => {
    const output = { heartReflection: [], putOffPutOn: [] };
    const transport = mockGeminiResponse(output);

    await expect(runCall1b({
      entryText: "reflection ".repeat(500),
      situationSummary: "A long journal reflection.",
    })).resolves.toEqual({ output, model: "gemini-4-hydrogen" });
    expectStructuredHydrogenRequest(transport, "heartReflection");
  });

  it("uses Hydrogen for a long kids discipleship log", async () => {
    const output = {
      summary: "A parenting moment.",
      whatMightBeGoingOnInTheHeart: [],
      gospelConnectionSuggestion: {
        ageAppropriatePhrase: "Jesus is kind to us.",
        scriptureToShare: "Ephesians 4:32",
        explanation: "Christ's kindness shapes ours.",
      },
      parentShepherdingNextSteps: [],
      recommendedResources: [
        {
          title: "Shepherding a Child's Heart",
          author: "Tedd Tripp",
          whyItFits: "It keeps parenting focused on the child's heart.",
        },
      ],
      scripture: [],
      encouragementForParent: "Keep shepherding patiently.",
      safetyFlags: [],
    };
    const transport = mockGeminiResponse(output);

    await expect(runKidsCall1({
      childName: "Sam",
      childAge: "8 years old",
      ageBracket: "MIDDLE_CHILDHOOD",
      characterGoal: null,
      competencyGoal: null,
      category: "NURTURE",
      entryText: "parenting moment ".repeat(500),
      gospelConnection: null,
    })).resolves.toEqual({ output, model: "gemini-4-hydrogen" });
    expectStructuredHydrogenRequest(transport, "gospelConnectionSuggestion");
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
