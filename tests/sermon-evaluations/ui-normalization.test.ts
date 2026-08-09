import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSermonMetricAverageRows,
  buildSermonTrendRows,
  listAvailableSermonMetrics,
} from "@/components/sermon-evaluation/analytics-data";
import {
  normalizeSermonEvaluationDetail,
  sermonExportUrl,
} from "@/components/sermon-evaluation/api";
import { canonicalDuplicateRedirectUrl } from "@/components/sermon-evaluation/canonical-redirect";
import { formatDate } from "@/components/sermon-evaluation/format";
import { normalizeSermonResult } from "@/components/sermon-evaluation/normalize";
import type { SermonAnalyticsPoint } from "@/components/sermon-evaluation/types";

function sermonAnalyticsPoint(
  overrides: Partial<SermonAnalyticsPoint>,
): SermonAnalyticsPoint {
  return {
    id: "evaluation",
    title: "Sermon",
    preacher: "John Calvin",
    preachedOn: "2026-07-27",
    createdAt: "2026-07-27T12:00:00.000Z",
    updatedAt: "2026-07-27T12:00:00.000Z",
    status: "COMPLETE",
    preset: "STANDARD",
    requestedRuns: 1,
    completedRuns: 1,
    overallImpactBase: 4,
    overallImpactAdjusted: null,
    durationAdjustmentEnabled: false,
    durationSeconds: 2_400,
    uncertaintyLow: null,
    uncertaintyHigh: null,
    hasRetainedAudio: true,
    runCredits: {
      limit: 9,
      consumed: 1,
      reserved: 0,
      remaining: 8,
    },
    aggregateScores: {},
    ...overrides,
  };
}

const canonicalResult = {
  extraction: {
    Scripture_Introduction: "Romans 8:1–4",
    Sermon_Introduction: "The sermon opens with the verdict of no condemnation.",
    Proposition: "Those united to Christ walk in freedom from condemnation.",
    Body: [
      {
        Point: "No condemnation in Christ",
        Verses: "Romans 8:1",
        Summary: "The believer's verdict rests in union with Christ.",
        Subpoints: ["The verdict is final", "The verdict is in Christ"],
        Illustrations: ["A canceled debt"],
        Application: ["Rest in Christ's finished work"],
        Comments: "The first point follows the text.",
        Feedback: "Make the transition to verse 2 more explicit.",
      },
    ],
    Conclusion: "Return to the objective hope of union with Christ.",
    General_Comments: {
      Content_Comments: "Christ-centered throughout.",
      Structure_Comments: "The movements follow the passage.",
      Explanation_Comments: "Key terms are explained in context.",
    },
    Fallen_Condition_Focus: {
      FCF: "Sinners look to their performance for a favorable verdict.",
      Comments: "The FCF is specific to the text.",
    },
    Extraction_Confidence: 0.91,
  },
  scoring: {
    Introduction: {
      FCF_Introduced: 4,
      Arouses_Attention: 3,
      Overall: 3,
      Feedback: "Name the tension earlier.",
    },
    Proposition: {
      Principle_and_Application_Wed: 4,
      Establishes_Main_Theme: 5,
      Summarizes_Introduction: 4,
      Overall: 4,
      Feedback: "The proposition is clear and pastoral.",
    },
    Main_Points: {
      Clarity: 4,
      Hortatory_Universal_Truths: 4,
      Proportional_and_Coexistent: 3,
      Exposition_Quality: 4,
      Illustration_Quality: 3,
      Application_Quality: 4,
      Overall: 4,
      Feedback: "The main movements are easy to follow.",
    },
    Exegetical_Support: {
      Alignment_with_Text: 5,
      Handles_Difficulties: 4,
      Proof_Accuracy_and_Clarity: 4,
      Context_and_Genre_Considered: 4,
      Not_Belabored: 4,
      Aids_Rather_Than_Impresses: 5,
      Overall: 4,
      Feedback: "The explanation remains anchored in Romans 8.",
    },
    Application: {
      Clear_and_Practical: 4,
      Redemptive_Focus: 5,
      Mandate_vs_Idea_Distinction: 4,
      Passage_Supported: 4,
      Overall: 4,
      Feedback: "Applications arise from the gospel logic of the text.",
    },
    Illustrations: {
      Lived_Body_Detail: 3,
      Strengthens_Points: 4,
      Proportion: 4,
      Ethical_Use: 5,
      Overall: 4,
      Feedback: "The debt image serves the main claim.",
    },
    Conclusion: {
      Summary: 4,
      Compelling_Exhortation: 4,
      Climax: 3,
      Pointed_End: 4,
      Overall: 4,
      Feedback: "The conclusion lands on Christ.",
    },
    Doctrinal_Fidelity: {
      Core_Doctrine_Fidelity: 5,
      Doctrinal_Proportionality: 4,
      Secondary_and_Tertiary_Charity: 4,
      Overall: 4,
      Core_Doctrine_Gate: "PASS",
      Gate_Reason: null,
      Feedback: "The sermon faithfully presents justification in Christ.",
    },
    Pastoral_Posture: {
      Shared_Subjection_and_Self_Application: 4,
      Servant_Authority: 5,
      Courageous_and_Gentle_Care: 4,
      Differentiated_Pastoral_Application: 3,
      Pastoral_Use_of_Power: 5,
      Overall: 4,
      Feedback: "The preacher stands under the same grace proclaimed to hearers.",
    },
    Strengths: ["The sermon keeps Christ's finished work central."],
    Growth_Areas: ["Clarify the transition from verdict to walk."],
    Next_Steps: ["Rewrite the transition into the second main point."],
    Scoring_Confidence: 0.87,
    Aggregated_Summary: {
      Textual_Fidelity: 4.5,
      Proposition_Clarity: 4.25,
      Introduction: 3.5,
      Application_Effectiveness: 4.25,
      Structure_Cohesion: 4,
      Illustrations: 3.75,
      Pastoral_Posture: 4.2,
      Overall_Impact_Base: 4.04,
      Overall_Impact_Adjusted: null,
      Overall_Impact: 4.04,
      duration_penalty: null,
      duration_adjustment_enabled: false,
    },
    Aggregated_Summary_Feedback: {
      Textual_Fidelity: "The sermon follows the controlling claims of the passage.",
      Proposition_Clarity: "The proposition is memorable.",
      Introduction: "The introduction could surface the tension sooner.",
      Application_Effectiveness: "Applications are redemptive and concrete.",
      Structure_Cohesion: "The structure follows the flow of Romans 8.",
      Illustrations: "The illustration serves rather than distracts.",
      Pastoral_Posture: "Authority is delegated and pastorally exercised.",
      Doctrinal_Fidelity: "No core contradiction is present.",
      Overall_Impact: "A faithful and pastorally useful sermon.",
    },
  },
};

describe("sermon result normalization", () => {
  it("preserves the canonical Step 1, nine-section rubric, aggregates, and coaching", () => {
    const normalized = normalizeSermonResult(canonicalResult);

    expect(Object.keys(normalized.aggregateScores)).toHaveLength(7);
    expect(Object.keys(normalized.aggregateFeedback)).toHaveLength(7);
    expect(normalized.rubricSections).toHaveLength(9);
    expect(
      normalized.rubricSections.reduce(
        (total, section) => total + section.subcriteria.length,
        0,
      ),
    ).toBe(37);
    expect(normalized.scoringConfidence).toBe(0.87);
    expect(normalized.doctrinalGate).toEqual({
      status: "PASS",
      reason: null,
    });
    expect(normalized.structure).toMatchObject({
      scriptureIntroduction: "Romans 8:1–4",
      sermonIntroduction:
        "The sermon opens with the verdict of no condemnation.",
      proposition:
        "Those united to Christ walk in freedom from condemnation.",
      fallenConditionFocus:
        "Sinners look to their performance for a favorable verdict.",
      fallenConditionComments: "The FCF is specific to the text.",
      conclusion: "Return to the objective hope of union with Christ.",
      extractionConfidence: 0.91,
    });
    expect(normalized.structure.points[0]).toMatchObject({
      heading: "No condemnation in Christ",
      scriptures: ["Romans 8:1"],
      subpoints: ["The verdict is final", "The verdict is in Christ"],
      applications: ["Rest in Christ's finished work"],
      illustrations: ["A canceled debt"],
      comments: "The first point follows the text.",
      feedback: "Make the transition to verse 2 more explicit.",
    });
    expect(normalized.structure.generalComments).toEqual({
      content: "Christ-centered throughout.",
      structure: "The movements follow the passage.",
      explanation: "Key terms are explained in context.",
    });
    expect(normalized.coaching).toEqual({
      summary: "A faithful and pastorally useful sermon.",
      strengths: ["The sermon keeps Christ's finished work central."],
      growthAreas: ["Clarify the transition from verdict to walk."],
      nextSteps: ["Rewrite the transition into the second main point."],
    });
  });

  it.each(["SCORING", "COMPLETE"] as const)(
    "maps the status response wrapper while the evaluation is %s",
    (stage) => {
      const normalized = normalizeSermonEvaluationDetail({
        evaluationId: "sermon-evaluation-1",
        progress: {
          stage,
          requestedRuns: 3,
          completedRuns: stage === "COMPLETE" ? 3 : 1,
          retryWave: 1,
          cancelRequested: false,
          warningCodes: stage === "COMPLETE" ? ["PARTIAL_VARIANCE"] : [],
          error: null,
          queuedAt: "2026-07-27T12:00:00.000Z",
          startedAt: "2026-07-27T12:00:02.000Z",
          attemptDeadlineAt: "2026-07-27T12:15:02.000Z",
          completedAt:
            stage === "COMPLETE" ? "2026-07-27T12:05:00.000Z" : null,
          updatedAt: "2026-07-27T12:03:00.000Z",
        },
        credits: {
          limit: 9,
          consumed: 3,
          reserved: 0,
          remaining: 6,
        },
      });

      expect(normalized.id).toBe("sermon-evaluation-1");
      expect(normalized.status).toBe(stage);
      expect(normalized.requestedRuns).toBe(3);
      expect(normalized.completedRuns).toBe(stage === "COMPLETE" ? 3 : 1);
      expect(normalized.retryWave).toBe(1);
      expect(normalized.runCredits).toEqual({
        limit: 9,
        consumed: 3,
        reserved: 0,
        remaining: 6,
      });
      expect(normalized.warnings).toEqual(
        stage === "COMPLETE" ? [{ message: "PARTIAL_VARIANCE" }] : [],
      );
    },
  );

  it("keeps numeric report versions addressable", () => {
    const normalized = normalizeSermonEvaluationDetail({
      evaluation: {
        id: "sermon-evaluation-1",
        status: "COMPLETE",
        reports: [
          {
            format: "markdown",
            version: 2,
            createdAt: "2026-07-27T12:00:00.000Z",
          },
        ],
        reportRegenerationPending: true,
      },
    });

    expect(normalized.reports).toEqual([
      {
        format: "markdown",
        version: "2",
        createdAt: "2026-07-27T12:00:00.000Z",
      },
    ]);
    expect(normalized.reportRegenerationPending).toBe(true);
    expect(sermonExportUrl(normalized.id, "markdown", "2")).toBe(
      "/api/v1/sermon-evaluations/sermon-evaluation-1/exports/markdown?version=2",
    );
  });

  it("turns a status-reported canonical evaluation into a duplicate redirect", () => {
    const normalized = normalizeSermonEvaluationDetail({
      evaluationId: "provisional-evaluation",
      progress: {
        stage: "FAILED",
        error: {
          code: "AUDIO_HASH_MISMATCH",
          message: "The verified audio belongs to an existing evaluation.",
        },
      },
      canonicalEvaluationId: "canonical-evaluation",
      canonicalDetailUrl: "/sermon-evaluation/canonical-evaluation",
    });

    expect(normalized.canonicalEvaluationId).toBe("canonical-evaluation");
    expect(normalized.canonicalDetailUrl).toBe(
      "/sermon-evaluation/canonical-evaluation",
    );
    expect(
      canonicalDuplicateRedirectUrl("provisional-evaluation", normalized),
    ).toBe(
      "/sermon-evaluation/canonical-evaluation?notice=duplicate",
    );
  });

  it("normalizes a canonical pointer from the current detail response", () => {
    const normalized = normalizeSermonEvaluationDetail({
      evaluation: {
        id: "provisional-evaluation",
        status: "FAILED",
        canonicalEvaluationId: "canonical-evaluation",
        canonicalDetailUrl: "/sermon-evaluation/canonical-evaluation",
      },
    });

    expect(
      canonicalDuplicateRedirectUrl("provisional-evaluation", normalized),
    ).toBe(
      "/sermon-evaluation/canonical-evaluation?notice=duplicate",
    );
  });

  it.each([
    {
      label: "self pointer",
      pointer: {
        canonicalEvaluationId: "provisional-evaluation",
        canonicalDetailUrl: "/sermon-evaluation/provisional-evaluation",
      },
    },
    {
      label: "malformed identifier",
      pointer: {
        canonicalEvaluationId: "../another-evaluation",
        canonicalDetailUrl: "/sermon-evaluation/../another-evaluation",
      },
    },
    {
      label: "external URL",
      pointer: {
        canonicalEvaluationId: "canonical-evaluation",
        canonicalDetailUrl: "https://example.com/sermon-evaluation/canonical-evaluation",
      },
    },
    {
      label: "mismatched detail URL",
      pointer: {
        canonicalEvaluationId: "canonical-evaluation",
        canonicalDetailUrl: "/sermon-evaluation/different-evaluation",
      },
    },
  ])("ignores a $label", ({ pointer }) => {
    expect(
      canonicalDuplicateRedirectUrl("provisional-evaluation", pointer),
    ).toBeNull();
  });

  it("derives the safe local detail URL when the optional URL is absent", () => {
    expect(
      canonicalDuplicateRedirectUrl("provisional-evaluation", {
        canonicalEvaluationId: "canonical-evaluation",
        canonicalDetailUrl: null,
      }),
    ).toBe(
      "/sermon-evaluation/canonical-evaluation?notice=duplicate",
    );
  });
});

describe("sermon UI data helpers", () => {
  it("formats a date-only preached date without shifting it across time zones", () => {
    const value = "2026-07-27";
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00.000Z`));

    expect(formatDate(value)).toBe(expected);
  });

  it("keeps distinct sermons preached on the same date in the trend data", () => {
    const common = {
      preacher: "John Calvin",
      preachedOn: "2026-07-27",
      createdAt: "2026-07-27T12:00:00.000Z",
      updatedAt: "2026-07-27T12:00:00.000Z",
      status: "COMPLETE",
      preset: "STANDARD",
      requestedRuns: 1,
      completedRuns: 1,
      overallImpactAdjusted: null,
      durationAdjustmentEnabled: false,
      durationSeconds: 2_400,
      uncertaintyLow: null,
      uncertaintyHigh: null,
      hasRetainedAudio: true,
      runCredits: {
        limit: 9,
        consumed: 1,
        reserved: 0,
        remaining: 8,
      },
      aggregateScores: {},
    } satisfies Omit<
      SermonAnalyticsPoint,
      "id" | "title" | "overallImpactBase"
    >;
    const evaluations: SermonAnalyticsPoint[] = [
      {
        ...common,
        id: "morning",
        title: "Morning sermon",
        overallImpactBase: 3.5,
      },
      {
        ...common,
        id: "evening",
        title: "Evening sermon",
        overallImpactBase: 4.25,
      },
    ];

    const rows = buildSermonTrendRows(
      evaluations,
      "overallImpactBase",
      ["John Calvin"],
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.evaluationId)).toEqual([
      "morning",
      "evening",
    ]);
    expect(rows.map((row) => row["score:John Calvin"])).toEqual([3.5, 4.25]);
  });

  it("offers every available sermon metric in a stable, meaningful order", () => {
    const evaluations = [
      sermonAnalyticsPoint({
        overallImpactAdjusted: null,
        aggregateScores: {
          illustrations: 2.5,
          textualFidelity: 4.5,
          introduction: 3.5,
        },
      }),
      sermonAnalyticsPoint({
        id: "evaluation-adjusted",
        overallImpactAdjusted: 3.75,
        aggregateScores: {
          textualFidelity: 3.5,
          introduction: 4,
          deliveryPresence: 4.25,
        },
      }),
    ];

    expect(listAvailableSermonMetrics(evaluations.slice(0, 1))).not.toContain(
      "overallImpactAdjusted",
    );
    expect(listAvailableSermonMetrics(evaluations)).toEqual([
      "overallImpactBase",
      "overallImpactAdjusted",
      "textualFidelity",
      "illustrations",
      "introduction",
      "deliveryPresence",
    ]);
  });

  it("builds aggregate averages from only sermons that contain each metric", () => {
    const evaluations = [
      sermonAnalyticsPoint({
        aggregateScores: {
          textualFidelity: 4.5,
          introduction: 3,
        },
      }),
      sermonAnalyticsPoint({
        id: "evaluation-two",
        aggregateScores: {
          textualFidelity: 3.5,
          introduction: 4,
          illustrations: 2.5,
        },
      }),
    ];

    expect(buildSermonMetricAverageRows(evaluations)).toEqual([
      { metric: "textualFidelity", average: 4, sermons: 2 },
      { metric: "introduction", average: 3.5, sermons: 2 },
      { metric: "illustrations", average: 2.5, sermons: 1 },
    ]);
  });
});

describe("incremental sermon hashing worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("publishes a complete progress payload at 100 percent", async () => {
    const postMessage = vi.fn();
    const workerScope: {
      onmessage:
        | ((event: MessageEvent<{ type: "hash"; file: File }>) => void)
        | null;
      postMessage: typeof postMessage;
    } = {
      onmessage: null,
      postMessage,
    };
    vi.stubGlobal("self", workerScope);
    await import("@/lib/sermon-evaluation/hash.worker");

    const handler = workerScope.onmessage as unknown as (
      event: MessageEvent<{ type: "hash"; file: File }>,
    ) => Promise<void>;
    await handler({
      data: {
        type: "hash",
        file: new File(["canonical sermon audio"], "sermon.mp3", {
          type: "audio/mpeg",
        }),
      },
    } as MessageEvent<{ type: "hash"; file: File }>);

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "complete",
        progress: 100,
        processedBytes: 22,
        totalBytes: 22,
      }),
    );
  });
});
