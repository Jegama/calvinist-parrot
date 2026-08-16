import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const executeRaw = vi.fn();
  const assetUpdate = vi.fn();
  const fingerprintFindUnique = vi.fn();
  const fingerprintUpdate = vi.fn();
  const reservationFindFirst = vi.fn();
  const reservationUpdate = vi.fn();
  const transaction = vi.fn(
    async (
      callback: (tx: {
        $executeRaw: typeof executeRaw;
        sermonAudioFingerprint: {
          findUnique: typeof fingerprintFindUnique;
          update: typeof fingerprintUpdate;
        };
        sermonAudioAsset: {
          update: typeof assetUpdate;
        };
        sermonUploadReservation: {
          findFirst: typeof reservationFindFirst;
          update: typeof reservationUpdate;
        };
      }) => Promise<unknown>,
    ) =>
      callback({
        $executeRaw: executeRaw,
        sermonAudioFingerprint: {
          findUnique: fingerprintFindUnique,
          update: fingerprintUpdate,
        },
        sermonAudioAsset: {
          update: assetUpdate,
        },
        sermonUploadReservation: {
          findFirst: reservationFindFirst,
          update: reservationUpdate,
        },
      }),
  );
  return {
    assetUpdate,
    deleteFile: vi.fn(),
    executeRaw,
    fingerprintFindUnique,
    fingerprintUpdate,
    getFile: vi.fn(),
    reservationFindFirst,
    reservationUpdate,
    transaction,
  };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: mocks.transaction,
    sermonUploadReservation: {
      findFirst: mocks.reservationFindFirst,
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
  getSermonAudioFile: mocks.getFile,
  hasOwnerOnlyFilePermissions: () => true,
  invokeSermonEvaluationWorker: vi.fn(),
}));

import { handleFinalizeSermonUpload } from "@/lib/sermon-evaluation/handlers";

const sha256 = "a".repeat(64);
const expiresAt = new Date("2026-07-29T00:00:00.000Z");
const loser = {
  id: "reservation-loser",
  ownerId: "owner-1",
  claimedSha256: sha256,
  originalFilename: "sermon.mp3",
  mimeType: "audio/mpeg",
  byteSize: 1024,
  requestedPreset: "HIGH_CONFIDENCE",
  requestedRuns: 3,
  appwriteBucketId: "bucket-1",
  appwriteFileId: "file-loser",
  state: "PREPARED",
  expiresAt,
  fingerprintId: null,
  reattachEvaluationId: null,
};

describe("simultaneous sermon upload finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRaw.mockResolvedValue(0);
    mocks.getFile.mockResolvedValue({
      $id: "file-loser",
      bucketId: "bucket-1",
      name: "sermon.mp3",
      sizeOriginal: 1024,
      mimeType: "audio/mpeg",
      chunksUploaded: 1,
      chunksTotal: 1,
      $permissions: ['read("user:owner-1")', 'write("user:owner-1")'],
    });
    mocks.reservationUpdate.mockResolvedValue({});
    mocks.assetUpdate.mockResolvedValue({ id: "asset-1" });
    mocks.fingerprintUpdate.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "fingerprint-1",
        ownerId: "owner-1",
        sha256,
        verificationState: data.verificationState,
        runCreditsLimit: 9,
        runCreditsReserved: 0,
        runCreditsConsumed: 0,
        audioAsset: {
          id: "asset-1",
          appwriteFileId: "file-rejected",
          deletedAt: null,
          verificationState: "REJECTED",
        },
        evaluations: [],
      }),
    );
    mocks.deleteFile.mockResolvedValue(undefined);
  });

  it("returns the winner's matching finalized reservation instead of the canceled loser", async () => {
    const canonical = {
      ...loser,
      id: "reservation-winner",
      appwriteFileId: "file-winner",
      state: "FINALIZED",
      fingerprintId: "fingerprint-1",
      finalizedAt: new Date("2026-07-28T00:00:00.000Z"),
    };
    mocks.reservationFindFirst
      .mockResolvedValueOnce(loser)
      .mockResolvedValueOnce(loser)
      .mockResolvedValueOnce(canonical);
    mocks.fingerprintFindUnique.mockResolvedValue({
      id: "fingerprint-1",
      ownerId: "owner-1",
      sha256,
      verificationState: "PROVISIONAL",
      runCreditsLimit: 9,
      runCreditsReserved: 0,
      runCreditsConsumed: 0,
      audioAsset: {
        id: "asset-1",
        appwriteFileId: "file-winner",
        deletedAt: null,
      },
      evaluations: [],
    });

    const response = await handleFinalizeSermonUpload(
      new Request(
        "http://localhost/api/v1/sermon-evaluations/uploads/finalize",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reservationId: loser.id,
            fileId: loser.appwriteFileId,
            sha256,
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      decision: "audio_ready",
      reservationId: "reservation-winner",
      audioAssetId: "asset-1",
    });
    expect(mocks.reservationFindFirst).toHaveBeenNthCalledWith(
      3,
      {
        where: {
          ownerId: "owner-1",
          fingerprintId: "fingerprint-1",
          appwriteFileId: "file-winner",
          state: "FINALIZED",
          requestedPreset: "HIGH_CONFIDENCE",
          requestedRuns: 3,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { finalizedAt: "desc" },
      },
    );
    expect(mocks.reservationUpdate).toHaveBeenCalledWith({
      where: { id: "reservation-loser" },
      data: {
        state: "CANCELED",
        fingerprintId: "fingerprint-1",
      },
    });
    expect(mocks.deleteFile).toHaveBeenCalledWith("file-loser");
  });

  it("does not overwrite an uncleared rejected asset pointer when cleanup remains pending", async () => {
    const rejectedAsset = {
      id: "asset-1",
      appwriteBucketId: "bucket-1",
      appwriteFileId: "file-rejected",
      deletedAt: null,
      verificationState: "REJECTED",
    };
    mocks.reservationFindFirst
      .mockResolvedValueOnce(loser)
      .mockResolvedValueOnce(loser);
    mocks.fingerprintFindUnique.mockResolvedValue({
      id: "fingerprint-1",
      ownerId: "owner-1",
      sha256,
      verificationState: "REJECTED",
      runCreditsLimit: 9,
      runCreditsReserved: 0,
      runCreditsConsumed: 0,
      audioAsset: rejectedAsset,
      evaluations: [
        {
          id: "evaluation-rejected",
          status: "FAILED",
        },
      ],
    });
    mocks.deleteFile.mockRejectedValue(
      new Error("Appwrite unavailable"),
    );

    const response = await handleFinalizeSermonUpload(
      new Request(
        "http://localhost/api/v1/sermon-evaluations/uploads/finalize",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reservationId: loser.id,
            fileId: loser.appwriteFileId,
            sha256,
          }),
        },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "The previously rejected audio is still awaiting storage cleanup; retry after cleanup completes",
    });
    expect(rejectedAsset).toMatchObject({
      appwriteBucketId: "bucket-1",
      appwriteFileId: "file-rejected",
    });
    expect(mocks.fingerprintUpdate).not.toHaveBeenCalled();
    expect(mocks.assetUpdate).not.toHaveBeenCalled();
    expect(mocks.reservationUpdate).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("reuses a cleaned rejected fingerprint without resetting its credit ledger", async () => {
    const rejectedFingerprint = {
      id: "fingerprint-1",
      ownerId: "owner-1",
      sha256,
      verificationState: "REJECTED",
      runCreditsLimit: 9,
      runCreditsReserved: 0,
      runCreditsConsumed: 0,
      audioAsset: {
        id: "asset-1",
        appwriteBucketId: null,
        appwriteFileId: null,
        deletedAt: null,
        verificationState: "REJECTED",
      },
      evaluations: [
        {
          id: "evaluation-rejected",
          status: "FAILED",
        },
      ],
    };
    mocks.reservationFindFirst
      .mockResolvedValueOnce(loser)
      .mockResolvedValueOnce(loser);
    mocks.fingerprintFindUnique.mockResolvedValue(
      rejectedFingerprint,
    );
    mocks.fingerprintUpdate.mockResolvedValue({
      ...rejectedFingerprint,
      verificationState: "PROVISIONAL",
    });

    const response = await handleFinalizeSermonUpload(
      new Request(
        "http://localhost/api/v1/sermon-evaluations/uploads/finalize",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reservationId: loser.id,
            fileId: loser.appwriteFileId,
            sha256,
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      decision: "audio_ready",
      reservationId: "reservation-loser",
      audioAssetId: "asset-1",
    });
    expect(mocks.fingerprintUpdate).toHaveBeenCalledWith({
      where: { id: "fingerprint-1" },
      data: {
        verificationState: "PROVISIONAL",
        verifiedAt: null,
        lastSeenAt: expect.any(Date),
      },
      include: expect.any(Object),
    });
    expect(
      mocks.fingerprintUpdate.mock.calls[0]?.[0]?.data,
    ).not.toHaveProperty("runCreditsConsumed");
    expect(
      mocks.fingerprintUpdate.mock.calls[0]?.[0]?.data,
    ).not.toHaveProperty("runCreditsReserved");
    expect(mocks.assetUpdate).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: {
        appwriteBucketId: "bucket-1",
        appwriteFileId: "file-loser",
        originalFilename: "sermon.mp3",
        mimeType: "audio/mpeg",
        byteSize: 1024,
        verificationState: "PENDING",
        deletedAt: null,
        verifiedAt: null,
      },
    });
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("accepts equivalent Appwrite MIME aliases from the same audio container family", async () => {
    const aliasReservation = {
      ...loser,
      mimeType: "audio/x-m4a",
    };
    mocks.reservationFindFirst
      .mockResolvedValueOnce(aliasReservation)
      .mockResolvedValueOnce(aliasReservation);
    mocks.getFile.mockResolvedValue({
      $id: "file-loser",
      bucketId: "bucket-1",
      name: "sermon.mp3",
      sizeOriginal: 1024,
      mimeType: "audio/mp4",
      chunksUploaded: 1,
      chunksTotal: 1,
      $permissions: ['read("user:owner-1")', 'write("user:owner-1")'],
    });
    mocks.fingerprintFindUnique.mockResolvedValue({
      id: "fingerprint-1",
      ownerId: "owner-1",
      sha256,
      verificationState: "VERIFIED",
      runCreditsLimit: 9,
      runCreditsReserved: 0,
      runCreditsConsumed: 0,
      audioAsset: {
        id: "asset-1",
        appwriteFileId: "file-loser",
        deletedAt: null,
        verificationState: "VERIFIED",
      },
      evaluations: [],
    });

    const response = await handleFinalizeSermonUpload(
      new Request(
        "http://localhost/api/v1/sermon-evaluations/uploads/finalize",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reservationId: aliasReservation.id,
            fileId: aliasReservation.appwriteFileId,
            sha256,
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.assetUpdate).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: expect.objectContaining({
        mimeType: "audio/x-m4a",
      }),
    });
  });

  it("rejects an Appwrite MIME type from a different audio container family", async () => {
    mocks.reservationFindFirst.mockResolvedValueOnce(loser);
    mocks.getFile.mockResolvedValue({
      $id: "file-loser",
      bucketId: "bucket-1",
      name: "sermon.mp3",
      sizeOriginal: 1024,
      mimeType: "audio/wav",
      chunksUploaded: 1,
      chunksTotal: 1,
      $permissions: ['read("user:owner-1")', 'write("user:owner-1")'],
    });

    const response = await handleFinalizeSermonUpload(
      new Request(
        "http://localhost/api/v1/sermon-evaluations/uploads/finalize",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reservationId: loser.id,
            fileId: loser.appwriteFileId,
            sha256,
          }),
        },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "The uploaded file metadata or permissions do not match the reservation",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
