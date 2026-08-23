import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const assetUpdate = vi.fn();
  const cleanupPointerUpdateMany = vi.fn();
  const evaluationFindFirst = vi.fn();
  const evaluationUpdateMany = vi.fn();
  const executeRaw = vi.fn();
  const transaction = vi.fn(
    async (
      callback: (tx: {
        $executeRaw: typeof executeRaw;
        sermonAudioAsset: { update: typeof assetUpdate };
        sermonEvaluation: {
          findFirst: typeof evaluationFindFirst;
          updateMany: typeof evaluationUpdateMany;
        };
      }) => Promise<unknown>,
    ) =>
      callback({
        $executeRaw: executeRaw,
        sermonAudioAsset: { update: assetUpdate },
        sermonEvaluation: {
          findFirst: evaluationFindFirst,
          updateMany: evaluationUpdateMany,
        },
      }),
  );
  return {
    assetUpdate,
    cleanupPointerUpdateMany,
    deleteFile: vi.fn(),
    evaluationFindFirst,
    evaluationUpdateMany,
    executeRaw,
    transaction,
  };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: mocks.transaction,
    sermonAudioAsset: {
      updateMany: mocks.cleanupPointerUpdateMany,
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
  deleteSermonAudioFile: mocks.deleteFile,
  getSermonAppwriteConfiguration: vi.fn(),
  getSermonAudioFile: vi.fn(),
  hasOwnerOnlyFilePermissions: vi.fn(),
  invokeSermonEvaluationWorker: vi.fn(),
}));

import { handleDeleteSermonAudio } from "@/lib/sermon-evaluation/handlers";

const evaluation = {
  id: "evaluation-1",
  status: "COMPLETE",
  audioAsset: {
    id: "asset-1",
    appwriteBucketId: "bucket-1",
    appwriteFileId: "file-1",
  },
};

describe("sermon audio deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRaw.mockResolvedValue(0);
    mocks.evaluationFindFirst
      .mockResolvedValueOnce(evaluation)
      .mockResolvedValueOnce(null);
    mocks.evaluationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.assetUpdate.mockResolvedValue({});
    mocks.cleanupPointerUpdateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("commits a recoverable deleted pointer when Appwrite deletion fails", async () => {
    mocks.deleteFile.mockRejectedValue(new Error("Appwrite unavailable"));

    const response = await handleDeleteSermonAudio("evaluation-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deleted: true,
      audioDeleted: false,
      cleanupPending: true,
    });
    expect(mocks.assetUpdate).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: {
        verificationState: "DELETED",
        deletedAt: expect.any(Date),
        referenceCount: 0,
      },
    });
    expect(mocks.cleanupPointerUpdateMany).not.toHaveBeenCalled();
  });

  it("clears storage pointers only after the external delete succeeds", async () => {
    mocks.deleteFile.mockResolvedValue(undefined);

    const response = await handleDeleteSermonAudio("evaluation-1");

    await expect(response.json()).resolves.toMatchObject({
      audioDeleted: true,
      cleanupPending: false,
    });
    expect(mocks.cleanupPointerUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "asset-1",
        verificationState: "DELETED",
        appwriteFileId: "file-1",
        deletedAt: { not: null },
      },
      data: {
        appwriteBucketId: null,
        appwriteFileId: null,
      },
    });
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteFile.mock.invocationCallOrder[0],
    );
    expect(mocks.deleteFile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cleanupPointerUpdateMany.mock.invocationCallOrder[0],
    );
  });
});
