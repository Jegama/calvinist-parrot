import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const evaluationFindFirst = vi.fn();
  const evaluationFindUnique = vi.fn();
  const evaluationUpdate = vi.fn();
  const evaluationUpdateMany = vi.fn();
  const evaluationAttemptUpdateMany = vi.fn();
  const executeRaw = vi.fn();
  const fingerprintUpdate = vi.fn();
  const invokeWorker = vi.fn();
  const queryRaw = vi.fn();
  const reservationUpdate = vi.fn();
  const reservationUpdateMany = vi.fn();
  const transaction = vi.fn(
    async (
      callback: (tx: {
        $executeRaw: typeof executeRaw;
        $queryRaw: typeof queryRaw;
        sermonAudioFingerprint: {
          update: typeof fingerprintUpdate;
        };
        sermonEvaluation: {
          findFirst: typeof evaluationFindFirst;
          findUnique: typeof evaluationFindUnique;
          update: typeof evaluationUpdate;
          updateMany: typeof evaluationUpdateMany;
        };
        sermonEvaluationAttempt: {
          updateMany: typeof evaluationAttemptUpdateMany;
        };
        sermonRunCreditReservation: {
          update: typeof reservationUpdate;
          updateMany: typeof reservationUpdateMany;
        };
      }) => Promise<unknown>,
    ) =>
      callback({
        $executeRaw: executeRaw,
        $queryRaw: queryRaw,
        sermonAudioFingerprint: {
          update: fingerprintUpdate,
        },
        sermonEvaluation: {
          findFirst: evaluationFindFirst,
          findUnique: evaluationFindUnique,
          update: evaluationUpdate,
          updateMany: evaluationUpdateMany,
        },
        sermonEvaluationAttempt: {
          updateMany: evaluationAttemptUpdateMany,
        },
        sermonRunCreditReservation: {
          update: reservationUpdate,
          updateMany: reservationUpdateMany,
        },
      }),
  );
  return {
    evaluationFindFirst,
    evaluationFindUnique,
    evaluationUpdate,
    evaluationUpdateMany,
    evaluationAttemptUpdateMany,
    executeRaw,
    fingerprintUpdate,
    invokeWorker,
    queryRaw,
    reservationUpdate,
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
  invokeSermonEvaluationWorker: mocks.invokeWorker,
}));

import {
  handleCancelSermonEvaluation,
  handleRetrySermonEvaluation,
} from "@/lib/sermon-evaluation/handlers";

type ReservationState = "RESERVED" | "CONSUMED";

function queuedEvaluation(state: ReservationState) {
  return {
    id: "evaluation-1",
    fingerprintId: "fingerprint-1",
    status: "QUEUED",
    creditReservation: {
      id: "reservation-1",
      requestedCredits: 3,
      consumedCredits: state === "CONSUMED" ? 3 : 0,
      state,
    },
  };
}

function retryableConsumedEvaluation() {
  return {
    ...queuedEvaluation("CONSUMED"),
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
  };
}

describe("queued sermon cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRaw.mockResolvedValue(0);
    mocks.queryRaw.mockResolvedValue([]);
    mocks.reservationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.fingerprintUpdate.mockResolvedValue({});
    mocks.reservationUpdate.mockResolvedValue({});
    mocks.evaluationUpdate.mockImplementation(
      async ({ data }: { data: { status?: string } }) => ({
        id: "evaluation-1",
        status: data.status ?? "QUEUED",
      }),
    );
    mocks.evaluationAttemptUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("cancels QUEUED work and releases only a RESERVED credit reservation", async () => {
    mocks.evaluationFindFirst.mockResolvedValue(
      queuedEvaluation("RESERVED"),
    );

    const response =
      await handleCancelSermonEvaluation("evaluation-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      evaluationId: "evaluation-1",
      status: "CANCELED",
    });
    expect(mocks.fingerprintUpdate).toHaveBeenCalledWith({
      where: { id: "fingerprint-1" },
      data: {
        runCreditsReserved: { decrement: 3 },
      },
    });
    expect(mocks.reservationUpdate).toHaveBeenCalledWith({
      where: { evaluationId: "evaluation-1" },
      data: {
        state: "RELEASED",
        releasedAt: expect.any(Date),
        releaseReason: "CANCELED_BEFORE_SCORING",
      },
    });
    expect(mocks.evaluationUpdate).toHaveBeenCalledWith({
      where: { id: "evaluation-1" },
      data: {
        status: "CANCELED",
        cancelRequestedAt: expect.any(Date),
        canceledAt: expect.any(Date),
        version: { increment: 1 },
      },
    });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.evaluationAttemptUpdateMany).toHaveBeenCalledWith({
      where: {
        evaluationId: "evaluation-1",
        endedAt: null,
      },
      data: {
        terminalOutcome: "CANCELED",
        endedAt: expect.any(Date),
      },
    });
  });

  it("cancels QUEUED work while preserving CONSUMED credits nonrefundably", async () => {
    mocks.evaluationFindFirst.mockResolvedValue(
      queuedEvaluation("CONSUMED"),
    );

    const response =
      await handleCancelSermonEvaluation("evaluation-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      evaluationId: "evaluation-1",
      status: "CANCELED",
    });
    expect(mocks.fingerprintUpdate).not.toHaveBeenCalled();
    expect(mocks.reservationUpdate).not.toHaveBeenCalled();
    expect(mocks.evaluationUpdate).toHaveBeenCalledWith({
      where: { id: "evaluation-1" },
      data: expect.objectContaining({
        status: "CANCELED",
        cancelRequestedAt: expect.any(Date),
        canceledAt: expect.any(Date),
      }),
    });
    expect(mocks.evaluationAttemptUpdateMany).toHaveBeenCalledWith({
      where: {
        evaluationId: "evaluation-1",
        endedAt: null,
      },
      data: {
        terminalOutcome: "CANCELED",
        endedAt: expect.any(Date),
      },
    });
  });

  it("lets cancellation terminalize a retry after its QUEUED commit but before worker invocation completes", async () => {
    let status = "FAILED";
    let finishInvocation:
      | ((value: { $id: string }) => void)
      | undefined;
    mocks.evaluationFindFirst.mockImplementation(
      async ({ where }: { where: { status?: unknown } }) => {
        if (where.status) {
          return status === "FAILED"
            ? retryableConsumedEvaluation()
            : null;
        }
        return status === "QUEUED"
          ? queuedEvaluation("CONSUMED")
          : null;
      },
    );
    mocks.evaluationUpdateMany.mockImplementation(async () => {
      if (status !== "FAILED") return { count: 0 };
      status = "QUEUED";
      return { count: 1 };
    });
    mocks.evaluationFindUnique.mockImplementation(async () => ({
      id: "evaluation-1",
      status,
    }));
    mocks.evaluationUpdate.mockImplementation(
      async ({ data }: { data: { status?: string } }) => {
        status = data.status ?? status;
        return { id: "evaluation-1", status };
      },
    );
    mocks.invokeWorker.mockImplementation(
      () =>
        new Promise<{ $id: string }>((resolve) => {
          finishInvocation = resolve;
        }),
    );

    const retryPromise =
      handleRetrySermonEvaluation("evaluation-1");
    await vi.waitFor(() =>
      expect(mocks.invokeWorker).toHaveBeenCalledOnce(),
    );

    const cancelResponse =
      await handleCancelSermonEvaluation("evaluation-1");
    finishInvocation?.({ $id: "execution-1" });
    const retryResponse = await retryPromise;

    expect(retryResponse.status).toBe(200);
    expect(cancelResponse.status).toBe(200);
    await expect(cancelResponse.json()).resolves.toEqual({
      evaluationId: "evaluation-1",
      status: "CANCELED",
    });
    expect(status).toBe("CANCELED");
    expect(mocks.fingerprintUpdate).not.toHaveBeenCalled();
    expect(mocks.reservationUpdate).not.toHaveBeenCalled();
    expect(mocks.evaluationAttemptUpdateMany).toHaveBeenCalledOnce();
  });
});
