import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  upsertAIOutput: vi.fn(),
  updateEntry: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/parrot-ai", () => ({
  DEFAULT_MODEL: {
    provider: "gemini",
    model: "gemini-3.6-flash",
  },
  parrotAI: {
    generateStructured: vi.fn(),
  },
}));

import { storeKidsAIOutput } from "./llm";

const call1 = {
  summary: "A shepherding summary.",
  whatMightBeGoingOnInTheHeart: ["A desire for approval may be involved."],
  gospelConnectionSuggestion: {
    ageAppropriatePhrase: "Jesus loves us before we perform.",
    scriptureToShare: "Romans 5:8",
    explanation: "Christ loved us while we were sinners.",
  },
  parentShepherdingNextSteps: ["Affirm grace rather than performance."],
  recommendedResources: [
    {
      title: "Parenting: 14 Gospel Principles That Can Radically Change Your Family",
      author: "Paul David Tripp",
      whyItFits: "It helps parents apply gospel grace to everyday shepherding.",
    },
  ],
  scripture: [
    {
      reference: "Romans 5:8",
      whyItApplies: "God's love rests on Christ, not performance.",
    },
  ],
  encouragementForParent: "Keep pointing to Christ's finished work.",
  safetyFlags: [],
};

const call2 = {
  tags: {
    circumstance: ["school"],
    heartIssue: ["approval"],
    virtue: ["faith"],
    developmentalArea: ["identity"],
  },
  suggestedChildPrayerRequests: [],
  suggestedMonthlyVisionAdjustments: [],
  parentConsistencyNote: null,
};

describe("storeKidsAIOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (
        callback: (tx: {
          journalEntryAI: { upsert: typeof mocks.upsertAIOutput };
          journalEntry: { update: typeof mocks.updateEntry };
        }) => Promise<unknown>
      ) =>
        callback({
          journalEntryAI: { upsert: mocks.upsertAIOutput },
          journalEntry: { update: mocks.updateEntry },
        })
    );
  });

  it("stores the reflection and flattened tags in one transaction", async () => {
    await storeKidsAIOutput(
      "entry-1",
      call1,
      call2,
      "gemini-3.6-flash"
    );

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.upsertAIOutput).toHaveBeenCalledWith({
      where: { entryId: "entry-1" },
      create: expect.objectContaining({
        entryId: "entry-1",
        call1,
        call2,
      }),
      update: expect.objectContaining({ call1, call2 }),
    });
    expect(mocks.updateEntry).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: { tags: ["school", "approval", "faith", "identity"] },
    });
  });

  it("propagates a tag failure from the shared transaction", async () => {
    const tagError = new Error("tag update failed");
    mocks.updateEntry.mockRejectedValue(tagError);

    await expect(
      storeKidsAIOutput("entry-1", call1, call2, "gemini-3.6-flash")
    ).rejects.toBe(tagError);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.upsertAIOutput).toHaveBeenCalledOnce();
    expect(mocks.updateEntry).toHaveBeenCalledOnce();
  });
});
