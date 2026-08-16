import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createSermonUploadJwt: vi.fn(),
  executeRaw: vi.fn(),
  fingerprintFindUnique: vi.fn(),
  getOwnerOnlyFilePermissions: vi.fn(),
  reservationCreate: vi.fn(),
  reservationCount: vi.fn(),
  reservationFindMany: vi.fn(),
  targetFindFirst: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: mocks.transaction,
    sermonAudioFingerprint: {
      findUnique: mocks.fingerprintFindUnique,
    },
    sermonEvaluation: {
      findFirst: mocks.targetFindFirst,
    },
    sermonRunCreditReservation: {
      findMany: mocks.reservationFindMany,
    },
    sermonUploadReservation: {
      count: mocks.reservationCount,
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
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
  createSermonUploadJwt: mocks.createSermonUploadJwt,
  deleteSermonAudioFile: vi.fn(),
  getSermonAppwriteConfiguration: () => ({
    endpoint: "https://cloud.appwrite.io/v1",
    projectId: "project-1",
    apiKey: "key-1",
    functionId: "function-1",
    bucketId: "bucket-1",
  }),
  getSermonAudioFile: vi.fn(),
  getOwnerOnlyFilePermissions: mocks.getOwnerOnlyFilePermissions,
  hasOwnerOnlyFilePermissions: vi.fn(),
  invokeSermonEvaluationWorker: vi.fn(),
}));

import { handlePrepareSermonUpload } from "@/lib/sermon-evaluation/handlers";

const requestedSha = "a".repeat(64);
const now = new Date("2026-07-28T00:00:00.000Z");

function evaluation(id: string, createdAt: Date) {
  return {
    id,
    title: `Sermon ${id}`,
    preachedOn: new Date("2026-07-27T00:00:00.000Z"),
    preset: "STANDARD" as const,
    requestedRuns: 1,
    completedRuns: 1,
    overallImpactBase: 3,
    overallImpactAdjusted: 3,
    durationAdjustmentEnabled: false,
    status: "COMPLETE" as const,
    createdAt,
  };
}

function fingerprint(sha256: string) {
  return {
    id: "fingerprint-1",
    ownerId: "owner-1",
    sha256,
    verificationState: "VERIFIED" as const,
    runCreditsLimit: 9,
    runCreditsReserved: 0,
    runCreditsConsumed: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    verifiedAt: now,
    audioAsset: null,
    evaluations: [
      evaluation("evaluation-latest", new Date("2026-07-28T00:00:00.000Z")),
      evaluation("evaluation-older", new Date("2026-07-27T00:00:00.000Z")),
    ],
  };
}

function request(reattachEvaluationId?: string) {
  return new Request(
    "http://localhost/api/v1/sermon-evaluations/uploads/prepare",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sha256: requestedSha,
        byteSize: 1024,
        filename: "sermon.mp3",
        mimeType: "audio/mpeg",
        preset: "standard",
        ...(reattachEvaluationId
          ? { reattachEvaluationId }
          : {}),
      }),
    },
  );
}

describe("sermon upload reattachment preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockReturnValue(true);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.getOwnerOnlyFilePermissions.mockImplementation((ownerId: string) => [
      `read("user:${ownerId}")`,
      `update("user:${ownerId}")`,
      `delete("user:${ownerId}")`,
    ]);
    mocks.reservationCount.mockResolvedValue(0);
    mocks.reservationFindMany.mockResolvedValue([]);
    mocks.createSermonUploadJwt.mockResolvedValue("upload-jwt");
    mocks.reservationCreate.mockResolvedValue({
      id: "reservation-1",
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        $executeRaw: mocks.executeRaw,
        sermonUploadReservation: {
          count: mocks.reservationCount,
          create: mocks.reservationCreate,
        },
      }),
    );
  });

  it("rate-limits upload preparation before creating storage authorization", async () => {
    mocks.checkRateLimit.mockReturnValue(false);

    const response = await handlePrepareSermonUpload(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error:
        "Too many sermon upload requests. Please finish an existing upload or try again later",
    });
    expect(mocks.fingerprintFindUnique).not.toHaveBeenCalled();
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
    expect(mocks.createSermonUploadJwt).not.toHaveBeenCalled();
  });

  it("caps active owner reservations before issuing another upload JWT", async () => {
    mocks.fingerprintFindUnique.mockResolvedValue(null);
    mocks.reservationCount.mockResolvedValue(3);

    const response = await handlePrepareSermonUpload(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "At most 3 sermon audio uploads can be pending at once",
    });
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
    expect(mocks.createSermonUploadJwt).not.toHaveBeenCalled();
  });

  it("rejects a wrong hash before creating a reservation or upload JWT", async () => {
    mocks.targetFindFirst.mockResolvedValue({
      id: "evaluation-older",
      fingerprint: fingerprint("b".repeat(64)),
    });

    const response = await handlePrepareSermonUpload(
      request("evaluation-older"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "The reattachment target and audio fingerprint do not match",
    });
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
    expect(mocks.createSermonUploadJwt).not.toHaveBeenCalled();
    expect(mocks.fingerprintFindUnique).not.toHaveBeenCalled();
  });

  it("binds an older requested history item instead of the latest evaluation", async () => {
    mocks.targetFindFirst.mockResolvedValue({
      id: "evaluation-older",
      fingerprint: fingerprint(requestedSha),
    });

    const response = await handlePrepareSermonUpload(
      request("evaluation-older"),
    );

    expect(response.status).toBe(200);
    expect(mocks.reservationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fingerprintId: "fingerprint-1",
        reattachEvaluationId: "evaluation-older",
      }),
    });
    expect(mocks.createSermonUploadJwt).toHaveBeenCalledOnce();
    expect(mocks.fingerprintFindUnique).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      decision: "upload_required",
      reservationId: "reservation-1",
      permissions: [
        'read("user:owner-1")',
        'update("user:owner-1")',
        'delete("user:owner-1")',
      ],
    });
    expect(mocks.getOwnerOnlyFilePermissions).toHaveBeenCalledWith(
      "owner-1",
    );
  });

  it("rejects reattachment while a deleted storage pointer is awaiting cleanup", async () => {
    mocks.targetFindFirst.mockResolvedValue({
      id: "evaluation-older",
      fingerprint: {
        ...fingerprint(requestedSha),
        audioAsset: {
          id: "asset-1",
          appwriteFileId: "file-pending-delete",
          deletedAt: new Date("2026-07-28T00:00:00.000Z"),
          verificationState: "DELETED",
        },
      },
    });

    const response = await handlePrepareSermonUpload(
      request("evaluation-older"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "The previous audio file is still awaiting storage cleanup; retry after cleanup completes",
    });
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
    expect(mocks.createSermonUploadJwt).not.toHaveBeenCalled();
  });

  it("starts a clean upload after rejected verification without presenting provisional history as canonical", async () => {
    mocks.fingerprintFindUnique.mockResolvedValue({
      ...fingerprint(requestedSha),
      verificationState: "REJECTED",
      verifiedAt: null,
      audioAsset: {
        id: "asset-rejected",
        appwriteFileId: "file-rejected",
        deletedAt: null,
        verificationState: "REJECTED",
      },
      evaluations: [
        {
          ...evaluation(
            "evaluation-rejected",
            new Date("2026-07-28T00:00:00.000Z"),
          ),
          status: "FAILED",
        },
      ],
    });

    const response = await handlePrepareSermonUpload(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      decision: "upload_required",
      reservationId: "reservation-1",
    });
    expect(mocks.reservationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        claimedSha256: requestedSha,
        fingerprintId: undefined,
        reattachEvaluationId: undefined,
      }),
    });
    expect(mocks.createSermonUploadJwt).toHaveBeenCalledOnce();
  });

  it("rejects reattachment to a non-verified fingerprint history item", async () => {
    mocks.targetFindFirst.mockResolvedValue({
      id: "evaluation-rejected",
      fingerprint: {
        ...fingerprint(requestedSha),
        verificationState: "REJECTED",
        verifiedAt: null,
      },
    });

    const response = await handlePrepareSermonUpload(
      request("evaluation-rejected"),
    );

    expect(response.status).toBe(409);
    expect(mocks.reservationCreate).not.toHaveBeenCalled();
    expect(mocks.createSermonUploadJwt).not.toHaveBeenCalled();
  });
});
