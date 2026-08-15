import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  findProfile: vi.fn(),
  findEntry: vi.fn(),
  getRecentEntryContext: vi.fn(),
  runCall1a: vi.fn(),
  runCall1b: vi.fn(),
  runCall1c: vi.fn(),
  runTagsAndSuggestions: vi.fn(),
  storeJournalAIOutput: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    userProfile: { findUnique: mocks.findProfile },
    journalEntry: { findUnique: mocks.findEntry },
  },
}));

vi.mock("@/utils/journal/llm", () => ({
  DEFAULT_CALL1B: { heartReflection: [], putOffPutOn: [] },
  DEFAULT_CALL1C: { scripture: [], practicalNextSteps: [], safetyFlags: [] },
  DEFAULT_CALL2: {
    tags: {
      circumstance: [],
      heartIssue: [],
      rulingDesire: [],
      virtue: [],
      theologicalTheme: [],
      meansOfGrace: [],
    },
    suggestedPrayerRequests: [],
    dashboardSignals: { recurringTheme: null },
  },
  getRecentEntryContext: mocks.getRecentEntryContext,
  runCall1a: mocks.runCall1a,
  runCall1b: mocks.runCall1b,
  runCall1c: mocks.runCall1c,
  runTagsAndSuggestions: mocks.runTagsAndSuggestions,
  storeJournalAIOutput: mocks.storeJournalAIOutput,
}));

import { POST } from "./route";

const call1a = {
  title: "Learning patience",
  oneSentenceSummary: "A difficult moment exposed impatience.",
  situationSummary: "The writer responded impatiently during a delay.",
};

const call1b = {
  heartReflection: ["A desire for control may have shaped the response."],
  putOffPutOn: [{ putOff: "Impatience", putOn: "Patient trust" }],
};

const call1c = {
  scripture: [
    {
      reference: "James 1:19",
      whyItApplies: "It calls believers to be slow to anger.",
    },
  ],
  practicalNextSteps: ["Pause before responding."],
  safetyFlags: [],
};

const call2 = {
  tags: {
    circumstance: ["delay"],
    heartIssue: ["control"],
    rulingDesire: [],
    virtue: ["patience"],
    theologicalTheme: [],
    meansOfGrace: [],
  },
  suggestedPrayerRequests: [],
  dashboardSignals: { recurringTheme: "patience" },
};

const entry = {
  id: "entry-1",
  authorProfileId: "profile-1",
  entryType: "PERSONAL",
  entryText: "A sufficiently detailed journal entry about an impatient response.",
  aiOutput: null,
};

function requestContext() {
  return { params: Promise.resolve({ id: entry.id }) };
}

async function readEvents(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("POST /api/journal/entries/[id]/reprocess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      errorResponse: null,
    });
    mocks.findProfile.mockResolvedValue({ id: "profile-1" });
    mocks.findEntry.mockResolvedValue(entry);
    mocks.getRecentEntryContext.mockResolvedValue({
      summaries: [],
      recurringThemes: [],
    });
    mocks.runCall1a.mockResolvedValue(call1a);
    mocks.runCall1b.mockResolvedValue({
      output: call1b,
      model: "gemini-3.6-flash",
    });
    mocks.runCall1c.mockResolvedValue({
      output: call1c,
      model: "gemini-3.6-flash",
    });
    mocks.runTagsAndSuggestions.mockResolvedValue(call2);
  });

  it("reprocesses a failed entry and records a complete status", async () => {
    const response = await POST(
      new Request("http://localhost/api/journal/entries/entry-1/reprocess", {
        method: "POST",
      }),
      requestContext()
    );

    expect(response.status).toBe(200);
    const events = await readEvents(response);
    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "call1a_complete",
      "progress",
      "call1b_complete",
      "call1c_complete",
      "call2_complete",
      "done",
    ]);
    expect(events.at(-1)).toMatchObject({ type: "done", call2 });
    expect(mocks.storeJournalAIOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: entry.id,
        failedStages: [],
        models: {
          call1bModel: "gemini-3.6-flash",
          call1cModel: "gemini-3.6-flash",
        },
      })
    );
  });

  it("rejects retry when the entry already has a complete reflection", async () => {
    mocks.findEntry.mockResolvedValue({
      ...entry,
      aiOutput: {
        call1: { ...call1a, ...call1b, ...call1c },
        call2,
        modelInfo: {
          status: "complete",
          failedStages: [],
          call1bModel: "gemini-3.6-flash",
          call1cModel: "gemini-3.6-flash",
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/journal/entries/entry-1/reprocess", {
        method: "POST",
      }),
      requestContext()
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This journal entry already has a complete AI reflection.",
    });
    expect(mocks.runCall1a).not.toHaveBeenCalled();
    expect(mocks.storeJournalAIOutput).not.toHaveBeenCalled();
  });

  it("communicates and persists partial generation failures", async () => {
    mocks.runTagsAndSuggestions.mockRejectedValue(
      new Error("provider unavailable")
    );

    const response = await POST(
      new Request("http://localhost/api/journal/entries/entry-1/reprocess", {
        method: "POST",
      }),
      requestContext()
    );
    const events = await readEvents(response);

    expect(events).toContainEqual({
      type: "call2_error",
      message: "Tags and prayer suggestions unavailable",
    });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      partial: true,
      failedStages: ["call2"],
    });
    expect(mocks.storeJournalAIOutput).toHaveBeenCalledWith(
      expect.objectContaining({ failedStages: ["call2"] })
    );
  });
});
