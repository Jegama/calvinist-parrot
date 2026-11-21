import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  updateAIOutput: vi.fn(),
  updateEntry: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/provider-usage", () => ({ markUsageOperationComplete: vi.fn() }));

import { storeKidsSuggestions } from "./llm";

const entry = { id: "entry-1", heritageOperationId: null };

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

describe("storeKidsSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (run) => run({
      $queryRaw: async () => [entry],
      journalEntryAI: {
        findUniqueOrThrow: async () => ({ call2: null, modelInfo: { model: "gemini-3.6-flash" } }),
        update: mocks.updateAIOutput,
      },
      journalEntry: { update: mocks.updateEntry },
    }));
  });

  it("stores suggestions and flattened tags in one transaction", async () => {
    await storeKidsSuggestions(entry, "checkpoint", { output: call2, model: "returned-haiku" });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.updateAIOutput).toHaveBeenCalledWith({
      where: { id: "checkpoint" },
      data: {
        call2,
        modelInfo: {
          call1Model: "gemini-3.6-flash",
          call2Model: "returned-haiku",
          promptVersion: expect.any(String),
        },
      },
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
      storeKidsSuggestions(entry, "checkpoint", { output: call2, model: "returned-haiku" })
    ).rejects.toBe(tagError);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.updateAIOutput).toHaveBeenCalledOnce();
    expect(mocks.updateEntry).toHaveBeenCalledOnce();
  });
});
