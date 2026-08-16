import { describe, expect, it } from "vitest";

import { getPersistedJournalGenerationStatus } from "./journal";

describe("getPersistedJournalGenerationStatus", () => {
  it("marks a saved entry without AI output as failed", () => {
    expect(getPersistedJournalGenerationStatus(null)).toBe("failed");
  });

  it("marks missing stored sections as partial", () => {
    expect(
      getPersistedJournalGenerationStatus({
        call1: { title: "Summary" },
        call2: null,
        modelInfo: { status: "complete" },
      })
    ).toBe("partial");
  });

  it("preserves an explicit partial status across reloads", () => {
    expect(
      getPersistedJournalGenerationStatus({
        call1: { title: "Summary" },
        call2: { tags: {} },
        modelInfo: { status: "partial", failedStages: ["call2"] },
      })
    ).toBe("partial");
  });

  it("recognizes legacy fallback model markers as partial", () => {
    expect(
      getPersistedJournalGenerationStatus({
        call1: { title: "Summary" },
        call2: { tags: {} },
        modelInfo: {
          call1bModel: "unknown",
          call1cModel: "gemini-3.6-flash",
        },
      })
    ).toBe("partial");
  });

  it("recognizes the legacy Call 2 fallback as partial", () => {
    expect(
      getPersistedJournalGenerationStatus({
        call1: { title: "Summary" },
        call2: {
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
        modelInfo: {
          call1bModel: "gemini-3-flash-preview",
          call1cModel: "gemini-3-flash-preview",
          call2Model: "gemini-3-flash-preview",
        },
      })
    ).toBe("partial");
  });

  it("honors an explicit complete status for an empty modern Call 2", () => {
    expect(
      getPersistedJournalGenerationStatus({
        call1: { title: "Summary" },
        call2: {
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
        modelInfo: {
          status: "complete",
          failedStages: [],
          call1bModel: "gemini-3.6-flash",
          call1cModel: "gemini-3.6-flash",
        },
      })
    ).toBe("complete");
  });

  it("marks fully generated output as complete", () => {
    expect(
      getPersistedJournalGenerationStatus({
        call1: { title: "Summary" },
        call2: { tags: {} },
        modelInfo: {
          status: "complete",
          failedStages: [],
          call1bModel: "gemini-3.6-flash",
          call1cModel: "gemini-3.6-flash",
        },
      })
    ).toBe("complete");
  });
});
