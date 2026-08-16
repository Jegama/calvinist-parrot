import { describe, expect, it } from "vitest";

import { sermonAnalyticsResponseSchema } from "@/lib/api/contracts/sermon-evaluations";

const aggregateScores = {
  textualFidelity: null,
  propositionClarity: null,
  introduction: null,
  applicationEffectiveness: null,
  structureCohesion: null,
  illustrations: null,
  pastoralPosture: null,
};

function responseWithAggregateScores(
  scores: typeof aggregateScores,
) {
  return {
    totals: { evaluations: 1, complete: 0, active: 1, preachers: 1 },
    series: [
      {
        evaluationId: "evaluation-1",
        fingerprintId: "fingerprint-1",
        preacherId: "preacher-1",
        preacher: "Pastor",
        title: "Sermon",
        preachedOn: "2026-08-09",
        preset: "standard",
        requestedRuns: 1,
        completedRuns: 0,
        createdAt: "2026-08-09T12:00:00.000Z",
        updatedAt: "2026-08-09T12:00:00.000Z",
        durationSeconds: null,
        hasRetainedAudio: true,
        credits: {
          runCreditsLimit: 9,
          runCreditsConsumed: 0,
          runCreditsReserved: 1,
          runCreditsRemaining: 8,
        },
        overallImpactBase: null,
        overallImpactAdjusted: null,
        aggregateScores: scores,
        uncertaintyLow: null,
        uncertaintyHigh: null,
        durationAdjustmentEnabled: false,
        status: "SCORING",
      },
    ],
  };
}

describe("sermon analytics contract", () => {
  it("requires explicit nullable legacy and v2 aggregate keys", () => {
    expect(
      sermonAnalyticsResponseSchema.safeParse(
        responseWithAggregateScores(aggregateScores),
      ).success,
    ).toBe(true);

    const missingV2 = Object.fromEntries(
      Object.entries(aggregateScores).filter(
        ([key]) => key !== "pastoralPosture",
      ),
    );
    expect(
      sermonAnalyticsResponseSchema.safeParse(
        responseWithAggregateScores(
          missingV2 as typeof aggregateScores,
        ),
      ).success,
    ).toBe(false);
  });
});
