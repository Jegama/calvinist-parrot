import { describe, expect, it } from "vitest";

import { isDurationReportRegenerationPending } from "@/lib/sermon-evaluation/reports";

const policyUpdatedAt = new Date("2026-07-28T03:00:00.000Z");

function report(
  format: "MARKDOWN" | "JSON" | "CSV",
  reportVersion: number,
  createdAt: string,
) {
  return {
    format,
    reportVersion,
    createdAt: new Date(createdAt),
  };
}

describe("duration-policy report staleness", () => {
  it("marks report artifacts older than the durable policy timestamp as stale", () => {
    expect(
      isDurationReportRegenerationPending(policyUpdatedAt, [
        report("MARKDOWN", 1, "2026-07-28T02:00:00.000Z"),
        report("JSON", 1, "2026-07-28T02:00:00.000Z"),
        report("CSV", 1, "2026-07-28T02:00:00.000Z"),
      ]),
    ).toBe(true);
  });

  it("requires one complete fresh report version before clearing the signal", () => {
    const incomplete = [
      report("MARKDOWN", 2, "2026-07-28T03:01:00.000Z"),
      report("JSON", 2, "2026-07-28T03:01:00.000Z"),
    ];
    expect(
      isDurationReportRegenerationPending(
        policyUpdatedAt,
        incomplete,
      ),
    ).toBe(true);
    expect(
      isDurationReportRegenerationPending(policyUpdatedAt, [
        ...incomplete,
        report("CSV", 2, "2026-07-28T03:01:00.000Z"),
      ]),
    ).toBe(false);
  });

  it("does not schedule regeneration when policy was never changed", () => {
    expect(isDurationReportRegenerationPending(null, [])).toBe(false);
  });
});
