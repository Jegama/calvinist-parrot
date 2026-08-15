import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const evaluationFindFirst = vi.fn();
  const evaluationFindUnique = vi.fn();
  const evaluationUpdateMany = vi.fn();
  const executeRaw = vi.fn();
  const queryRaw = vi.fn();
  const reservationUpdateMany = vi.fn();
  const transaction = vi.fn(
    async (
      callback: (tx: {
        $executeRaw: typeof executeRaw;
        $queryRaw: typeof queryRaw;
        sermonEvaluation: {
          findFirst: typeof evaluationFindFirst;
          findUnique: typeof evaluationFindUnique;
          updateMany: typeof evaluationUpdateMany;
        };
        sermonRunCreditReservation: {
          updateMany: typeof reservationUpdateMany;
        };
      }) => Promise<unknown>,
    ) =>
      callback({
        $executeRaw: executeRaw,
        $queryRaw: queryRaw,
        sermonEvaluation: {
          findFirst: evaluationFindFirst,
          findUnique: evaluationFindUnique,
          updateMany: evaluationUpdateMany,
        },
        sermonRunCreditReservation: {
          updateMany: reservationUpdateMany,
        },
      }),
  );
  return {
    evaluationFindFirst,
    evaluationFindUnique,
    evaluationUpdateMany,
    executeRaw,
    invokeWorker: vi.fn(),
    queryRaw,
    reservationUpdateMany,
    transaction,
  };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: mocks.transaction,
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
  invokeSermonEvaluationWorker: mocks.invokeWorker,
}));

import { handleRetrySermonEvaluation } from "@/lib/sermon-evaluation/handlers";

function retryableEvaluation(
  reservationState: "RESERVED" | "CONSUMED" | "RELEASED" = "RESERVED",
) {
  return {
    id: "evaluation-1",
    fingerprintId: "fingerprint-1",
    status: "FAILED",
    audioAsset: {
      id: "asset-1",
      appwriteFileId: "file-1",
      deletedAt: null,
      verificationState: "VERIFIED",
    },
    fingerprint: {
      verificationState: "VERIFIED",
    },
    creditReservation: {
      id: "credit-1",
      requestedCredits: 3,
      consumedCredits: reservationState === "CONSUMED" ? 3 : 0,
      state: reservationState,
    },
  };
}

describe("sermon retry transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRaw.mockResolvedValue(0);
    mocks.evaluationFindUnique.mockResolvedValue({
      id: "evaluation-1",
      status: "QUEUED",
    });
    mocks.queryRaw.mockResolvedValue([{ id: "fingerprint-1" }]);
    mocks.reservationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.invokeWorker.mockResolvedValue({ $id: "execution-1" });
  });

  it("invokes the worker only for the request that wins the retry compare-and-set", async () => {
    mocks.evaluationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.evaluationFindFirst
      .mockResolvedValueOnce(retryableEvaluation())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "evaluation-1" });

    const first = await handleRetrySermonEvaluation("evaluation-1");
    const second = await handleRetrySermonEvaluation("evaluation-1");

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(mocks.evaluationUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "evaluation-1",
          ownerId: "owner-1",
          status: { in: ["FAILED", "TIMED_OUT"] },
        }),
      }),
    );
    expect(mocks.invokeWorker).toHaveBeenCalledOnce();
    expect(mocks.invokeWorker).toHaveBeenCalledWith({
      action: "evaluate",
      evaluationId: "evaluation-1",
    });
  });

  it("restores the same released reservation without creating a daily charge", async () => {
    mocks.evaluationFindFirst.mockResolvedValueOnce(
      retryableEvaluation("RELEASED"),
    );
    mocks.evaluationUpdateMany.mockResolvedValue({ count: 1 });

    const response = await handleRetrySermonEvaluation("evaluation-1");

    expect(response.status).toBe(200);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.reservationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "credit-1",
        state: "RELEASED",
      },
      data: {
        state: "RESERVED",
        releasedAt: null,
        releaseReason: null,
      },
    });
    expect(mocks.evaluationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retryWave: 0 }),
      }),
    );
    expect(mocks.invokeWorker).toHaveBeenCalledOnce();
  });

  it("rejects retry before queuing when retained audio is unavailable", async () => {
    mocks.evaluationFindFirst.mockResolvedValueOnce({
      ...retryableEvaluation(),
      audioAsset: null,
    });

    const response = await handleRetrySermonEvaluation("evaluation-1");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "This evaluation cannot be retried because its retained audio is missing or failed verification",
    });
    expect(mocks.evaluationUpdateMany).not.toHaveBeenCalled();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.invokeWorker).not.toHaveBeenCalled();
  });
});
