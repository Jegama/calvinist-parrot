import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportDownloads } from "@/components/sermon-evaluation/report-downloads";
import type { SermonEvaluationDetail } from "@/components/sermon-evaluation/types";

function evaluation(
  reportRegenerationPending: boolean,
): SermonEvaluationDetail {
  return {
    id: "evaluation-1",
    reportRegenerationPending,
    reports: [
      {
        format: "markdown",
        version: "1",
        createdAt: "2026-07-27T12:00:00.000Z",
      },
    ],
  } as SermonEvaluationDetail;
}

describe("sermon report downloads", () => {
  it("explains regeneration and hides stale report links while pending", () => {
    const markup = renderToStaticMarkup(
      <ReportDownloads evaluation={evaluation(true)} />,
    );

    expect(markup).toContain("Updating versioned reports");
    expect(markup).toContain("Report downloads are paused");
    expect(markup).not.toContain("/exports/");
  });

  it("restores report links after the fresh report set is complete", () => {
    const markup = renderToStaticMarkup(
      <ReportDownloads evaluation={evaluation(false)} />,
    );

    expect(markup).not.toContain("Updating versioned reports");
    expect(markup).toContain(
      "/api/v1/sermon-evaluations/evaluation-1/exports/markdown?version=1",
    );
  });
});
