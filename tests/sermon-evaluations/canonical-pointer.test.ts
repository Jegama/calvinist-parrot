import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  evaluationFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    sermonEvaluation: {
      findFirst: mocks.evaluationFindFirst,
    },
  },
}));

vi.mock("@/lib/sermon-evaluation/auth", () => ({
  getSermonEvaluationCapabilities: vi.fn(),
  isSermonEvaluationAdmin: () => false,
  requireSermonEvaluationAccess: async () => ({
    user: {
      $id: "owner-1",
      labels: ["sermon-evaluator-beta"],
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

import {
  getSermonEvaluationResponseSchema,
  sermonEvaluationStatusResponseSchema,
} from "@/lib/api/contracts";
import {
  handleGetSermonEvaluation,
  handleGetSermonEvaluationStatus,
} from "@/lib/sermon-evaluation/handlers";

const createdAt = new Date("2026-07-28T00:00:00.000Z");
const updatedAt = new Date("2026-07-28T00:01:00.000Z");

const historyEvaluation = {
  id: "duplicate-evaluation",
  title: "Duplicate upload",
  preachedOn: new Date("2026-07-27T00:00:00.000Z"),
  preset: "STANDARD" as const,
  requestedRuns: 1,
  completedRuns: 0,
  overallImpactBase: null,
  overallImpactAdjusted: null,
  durationAdjustmentEnabled: false,
  status: "FAILED" as const,
  createdAt,
};

const baseEvaluation = {
  ...historyEvaluation,
  ownerId: "owner-1",
  preacherId: "preacher-1",
  fingerprintId: "fingerprint-duplicate",
  audioAssetId: "asset-duplicate",
  sourceEvaluationId: null,
  retryWave: 0,
  cancelRequestedAt: null,
  warningCodes: [],
  errorCode: "AUDIO_HASH_MISMATCH",
  errorMessage: "The uploaded audio hash did not match",
  startedAt: createdAt,
  attemptDeadlineAt: null,
  completedAt: updatedAt,
  updatedAt,
  calculatedDurationPenalty: null,
  result: {
    canonicalEvaluationId: "canonical-evaluation",
  },
  provenance: null,
  durationPolicyUpdatedAt: null,
  preacher: {
    id: "preacher-1",
    displayName: "Integration Pastor",
  },
  audioAsset: {
    appwriteFileId: "file-rejected",
    originalFilename: "duplicate.mp3",
    mimeType: "audio/mpeg",
    byteSize: 1024,
    durationSeconds: null,
    verificationState: "REJECTED",
    deletedAt: null,
  },
  fingerprint: {
    runCreditsLimit: 9,
    runCreditsConsumed: 0,
    runCreditsReserved: 0,
    evaluations: [historyEvaluation],
  },
  reportArtifacts: [],
};

describe("canonical sermon duplicate pointer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the same-owner canonical pointer in detail responses", async () => {
    mocks.evaluationFindFirst
      .mockResolvedValueOnce(baseEvaluation)
      .mockResolvedValueOnce({ id: "canonical-evaluation" });

    const response = await handleGetSermonEvaluation(
      "duplicate-evaluation",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getSermonEvaluationResponseSchema.safeParse(body).success).toBe(
      true,
    );
    expect(body.evaluation).toMatchObject({
      canonicalEvaluationId: "canonical-evaluation",
      canonicalDetailUrl:
        "/sermon-evaluation/canonical-evaluation",
    });
    expect(mocks.evaluationFindFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: "canonical-evaluation",
        ownerId: "owner-1",
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it("exposes the same-owner canonical pointer in status responses", async () => {
    mocks.evaluationFindFirst
      .mockResolvedValueOnce(baseEvaluation)
      .mockResolvedValueOnce({ id: "canonical-evaluation" });

    const response = await handleGetSermonEvaluationStatus(
      "duplicate-evaluation",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      sermonEvaluationStatusResponseSchema.safeParse(body).success,
    ).toBe(true);
    expect(body).toMatchObject({
      evaluationId: "duplicate-evaluation",
      canonicalEvaluationId: "canonical-evaluation",
      canonicalDetailUrl:
        "/sermon-evaluation/canonical-evaluation",
    });
  });

  it("does not expose a missing, deleted, or cross-owner result pointer", async () => {
    mocks.evaluationFindFirst
      .mockResolvedValueOnce(baseEvaluation)
      .mockResolvedValueOnce(null);

    const response = await handleGetSermonEvaluationStatus(
      "duplicate-evaluation",
    );

    await expect(response.json()).resolves.toMatchObject({
      canonicalEvaluationId: null,
      canonicalDetailUrl: null,
    });
  });
});
