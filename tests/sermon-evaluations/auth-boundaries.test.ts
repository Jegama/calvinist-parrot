import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/prisma", () => ({
  default: {},
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
  handleGetSermonCapabilities,
  handlePrepareSermonUpload,
} from "@/lib/sermon-evaluation/handlers";

const originalAdminId = process.env.ADMIN_ID;

function authenticated(labels: string[]) {
  return {
    user: {
      $id: "user-1",
      labels,
    },
    userId: "user-1",
    errorResponse: null,
  };
}

describe("sermon feature authorization boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_ID;
  });

  afterEach(() => {
    if (originalAdminId === undefined) {
      delete process.env.ADMIN_ID;
    } else {
      process.env.ADMIN_ID = originalAdminId;
    }
  });

  it("returns 403 for an authenticated user without a sermon feature label", async () => {
    mocks.requireAuthenticatedUser.mockResolvedValue(
      authenticated([]),
    );

    const response = await handleGetSermonCapabilities();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Sermon evaluation access is not enabled for this account",
    });
  });

  it("treats the sermon administrator label as implied beta access", async () => {
    mocks.requireAuthenticatedUser.mockResolvedValue(
      authenticated(["sermonevaluatoradmin"]),
    );

    const response = await handleGetSermonCapabilities();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      capabilities: {
        hasAccess: true,
        isAdmin: true,
        canChooseCustomRunCount: true,
        dailyQuotaExempt: true,
        allowedRunCount: { min: 1, max: 9 },
        dailyRunLimit: 6,
      },
    });
  });

  it("rejects custom runs when the current request no longer has the administrator label", async () => {
    mocks.requireAuthenticatedUser.mockResolvedValue(
      authenticated(["sermonevaluatorbeta"]),
    );

    const response = await handlePrepareSermonUpload(
      new Request(
        "http://localhost/api/v1/sermon-evaluations/uploads/prepare",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sha256: "a".repeat(64),
            byteSize: 1024,
            filename: "sermon.mp3",
            mimeType: "audio/mpeg",
            preset: "custom",
            requestedRuns: 4,
          }),
        },
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error:
        "Custom scoring-run counts require sermon administrator access",
    });
  });

  it("does not grant sermon access or admin capability from ADMIN_ID alone", async () => {
    process.env.ADMIN_ID = "user-1";
    mocks.requireAuthenticatedUser.mockResolvedValue(
      authenticated([]),
    );

    const response = await handleGetSermonCapabilities();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Sermon evaluation access is not enabled for this account",
    });
  });
});
