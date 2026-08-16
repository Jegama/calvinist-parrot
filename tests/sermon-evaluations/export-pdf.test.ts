import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  evaluationFindFirst: vi.fn(),
  reportFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    sermonEvaluation: {
      findFirst: mocks.evaluationFindFirst,
    },
    sermonReportArtifact: {
      findFirst: mocks.reportFindFirst,
    },
  },
}));

vi.mock("@/lib/sermon-evaluation/auth", () => ({
  getSermonEvaluationCapabilities: vi.fn(),
  isSermonEvaluationAdmin: () => false,
  requireSermonEvaluationAccess: async () => ({
    user: {
      $id: "owner-1",
      labels: ["sermonevaluatorbeta"],
    },
    userId: "owner-1",
    errorResponse: null,
  }),
}));

vi.mock("@/lib/sermon-evaluation/appwrite", () => ({
  createSermonPlaybackUrl: vi.fn(),
  createSermonUploadJwt: vi.fn(),
  deleteSermonAudioFile: vi.fn(),
  getSermonAppwriteConfiguration: vi.fn(),
  getSermonAudioFile: vi.fn(),
  hasOwnerOnlyFilePermissions: vi.fn(),
  invokeSermonEvaluationWorker: vi.fn(),
}));

import { handleGetSermonExport } from "@/lib/sermon-evaluation/handlers";

describe("sermon PDF exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evaluationFindFirst.mockResolvedValue({
      id: "evaluation-1",
      title: "Christ's Humility",
    });
    mocks.reportFindFirst.mockResolvedValue({
      content: Buffer.from(
        "# Sermon Evaluation Report\n\n## Coaching\n\nPreach Christ clearly.",
      ),
      checksum: "markdown-checksum",
    });
  });

  it("converts the requested immutable Markdown version to a PDF download", async () => {
    const response = await handleGetSermonExport(
      new Request(
        "http://localhost/api/v1/sermon-evaluations/evaluation-1/exports/pdf?version=2",
      ),
      "evaluation-1",
      "pdf",
    );
    const content = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Christ-s-Humility.pdf"',
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(content.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(mocks.reportFindFirst).toHaveBeenCalledWith({
      where: {
        evaluationId: "evaluation-1",
        format: "MARKDOWN",
        reportVersion: 2,
      },
      orderBy: { reportVersion: "desc" },
    });
  });
});
