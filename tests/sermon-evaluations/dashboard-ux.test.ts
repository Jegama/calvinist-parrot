import { describe, expect, it } from "vitest";
import {
  buildSermonTrendRows,
  latestCompletedEvaluationPerSermon,
  latestEvaluationPerSermon,
} from "@/components/sermon-evaluation/analytics-data";
import {
  filterSermonAnalyticsByLatestSelection,
  matchesSermonStatusGroup,
} from "@/components/sermon-evaluation/dashboard";
import { SERMON_STATUSES } from "@/components/sermon-evaluation/types";
import type { SermonAnalyticsPoint, SermonStatus } from "@/components/sermon-evaluation/types";

function point(overrides: Partial<SermonAnalyticsPoint> = {}): SermonAnalyticsPoint {
  return {
    id: "evaluation",
    fingerprintId: "fingerprint",
    title: "Sermon",
    preacherId: "preacher-one",
    preacher: "John Calvin",
    preachedOn: "2026-08-10",
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z",
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
    runCredits: { limit: 9, consumed: 1, reserved: 0, remaining: 8 },
    aggregateScores: {},
    ...overrides,
  };
}

describe("sermon dashboard UX helpers", () => {
  it("keeps the newest run operationally while preserving the newest completed score", () => {
    const evaluations = [
      point({ id: "completed", createdAt: "2026-08-10T12:00:00.000Z" }),
      point({
        id: "active-rerun",
        createdAt: "2026-08-11T12:00:00.000Z",
        status: "SCORING",
        overallImpactBase: null,
      }),
      point({
        id: "failed-rerun",
        createdAt: "2026-08-12T12:00:00.000Z",
        status: "FAILED",
        overallImpactBase: null,
      }),
    ];

    expect(latestEvaluationPerSermon(evaluations).map(({ id }) => id)).toEqual(["failed-rerun"]);
    expect(latestCompletedEvaluationPerSermon(evaluations).map(({ id }) => id)).toEqual(["completed"]);
  });

  it("assigns every evaluation status to a user-facing status group", () => {
    const membership = new Map<SermonStatus, string>();
    for (const status of SERMON_STATUSES) {
      for (const group of ["in_progress", "completed", "needs_attention", "canceled"] as const) {
        if (matchesSermonStatusGroup(status, group)) membership.set(status, group);
      }
    }

    expect([...membership.keys()]).toEqual(SERMON_STATUSES);
    expect(new Set(membership.values())).toEqual(
      new Set(["in_progress", "completed", "needs_attention", "canceled"]),
    );
  });

  it("limits preserved completed analytics to sermons admitted by the latest-status filter", () => {
    const analyticsEvaluations = [
      point({ id: "completed-before-failure", fingerprintId: "failed" }),
      point({ id: "completed-before-active", fingerprintId: "active" }),
      point({ id: "completed-before-cancel", fingerprintId: "canceled" }),
      point({ id: "current-completed", fingerprintId: "completed" }),
    ];
    const latestEvaluations = [
      point({
        id: "failed-rerun",
        fingerprintId: "failed",
        status: "FAILED",
        overallImpactBase: null,
      }),
      point({
        id: "active-rerun",
        fingerprintId: "active",
        status: "SCORING",
        overallImpactBase: null,
      }),
      point({
        id: "canceled-rerun",
        fingerprintId: "canceled",
        status: "CANCELED",
        overallImpactBase: null,
      }),
      point({ id: "current-completed", fingerprintId: "completed" }),
    ];

    const analyticsFor = (
      group: "in_progress" | "completed" | "needs_attention" | "canceled",
    ) =>
      filterSermonAnalyticsByLatestSelection(
        analyticsEvaluations,
        latestEvaluations.filter((evaluation) =>
          matchesSermonStatusGroup(evaluation.status, group),
        ),
      ).map((evaluation) => evaluation.fingerprintId);

    expect(analyticsFor("completed")).toEqual(["completed"]);
    expect(analyticsFor("in_progress")).toEqual(["active"]);
    expect(analyticsFor("needs_attention")).toEqual(["failed"]);
    expect(analyticsFor("canceled")).toEqual(["canceled"]);
  });

  it("uses stable preacher IDs for chart series even when display names match", () => {
    const rows = buildSermonTrendRows(
      [
        point({ id: "one", preacherId: "preacher-one" }),
        point({ id: "two", preacherId: "preacher-two", fingerprintId: "other" }),
      ],
      "overallImpactBase",
      ["preacher-one", "preacher-two"],
    );

    expect(rows[0]["score:preacher-one"]).toBe(4);
    expect(rows[1]["score:preacher-two"]).toBe(4);
    expect(rows[0]["score:preacher-two"]).toBeUndefined();
  });
});
