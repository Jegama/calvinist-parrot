import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { DEFAULT_MODEL, parrotAI } from "@/lib/parrot-ai";
import { runCall1b } from "@/utils/journal/llm";
import { runKidsCall1 } from "@/utils/kids-discipleship/llm";

describe("journal and kids model routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the stable Gemini 3.6 Flash model by default", () => {
    expect(DEFAULT_MODEL).toEqual({
      provider: "gemini",
      model: "gemini-3.6-flash",
    });
  });

  it("does not override the default model for a long journal entry", async () => {
    const generateStructured = vi
      .spyOn(parrotAI, "generateStructured")
      .mockResolvedValue({
        data: { heartReflection: [], putOffPutOn: [] },
        model: DEFAULT_MODEL.model,
        provider: DEFAULT_MODEL.provider,
      });

    await runCall1b({
      entryText: "reflection ".repeat(500),
      situationSummary: "A long journal reflection.",
    });

    expect(generateStructured).toHaveBeenCalledOnce();
    expect(generateStructured.mock.calls[0]?.[0]).not.toHaveProperty("modelSpec");
  });

  it("does not override the default model for a long kids log", async () => {
    const generateStructured = vi
      .spyOn(parrotAI, "generateStructured")
      .mockResolvedValue({
        data: {
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
        },
        model: DEFAULT_MODEL.model,
        provider: DEFAULT_MODEL.provider,
      });

    await runKidsCall1({
      childName: "Sam",
      childAge: "8 years old",
      ageBracket: "MIDDLE_CHILDHOOD",
      characterGoal: null,
      competencyGoal: null,
      category: "NURTURE",
      entryText: "parenting moment ".repeat(500),
      gospelConnection: null,
    });

    expect(generateStructured).toHaveBeenCalledOnce();
    expect(generateStructured.mock.calls[0]?.[0]).not.toHaveProperty("modelSpec");
  });
});
