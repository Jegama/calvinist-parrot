import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {},
}));

import {
  createSermonEvaluationRequestSchema,
  finalizeSermonUploadRequestSchema,
  prepareSermonUploadRequestSchema,
  prepareSermonUploadResponseSchema,
  reevaluateSermonRequestSchema,
} from "@/lib/api/contracts";
import {
  getSermonEvaluationCapabilities,
  hasSermonEvaluationAccess,
  isSermonEvaluationAdmin,
} from "@/lib/sermon-evaluation/auth";
import {
  resolveRunSelection,
  SermonQuotaError,
} from "@/lib/sermon-evaluation/quotas";

const sha256 = "A".repeat(64);

describe("sermon evaluation contracts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes SHA-256 and rejects spoofed authority fields", () => {
    const valid = prepareSermonUploadRequestSchema.parse({
      sha256,
      byteSize: 1024,
      filename: "sermon.mp3",
      mimeType: "audio/mpeg",
      preset: "standard",
    });
    expect(valid.sha256).toBe("a".repeat(64));

    expect(
      prepareSermonUploadRequestSchema.safeParse({
        ...valid,
        isAdmin: true,
      }).success,
    ).toBe(false);
    expect(
      createSermonEvaluationRequestSchema.safeParse({
        uploadReservationId: "upload-1",
        title: "Grace Alone",
        preacher: "Example Pastor",
        preachedOn: "2026-07-27",
        preset: "standard",
        ownerId: "someone-else",
      }).success,
    ).toBe(false);
  });

  it("enforces upload and custom-run bounds", () => {
    expect(
      prepareSermonUploadRequestSchema.safeParse({
        sha256,
        byteSize: 62_914_561,
        filename: "sermon.mp3",
        mimeType: "audio/mpeg",
        preset: "standard",
      }).success,
    ).toBe(false);
    expect(
      reevaluateSermonRequestSchema.safeParse({
        preset: "custom",
        requestedRuns: 10,
      }).success,
    ).toBe(false);
    expect(
      finalizeSermonUploadRequestSchema.safeParse({
        reservationId: "reservation-1",
        fileId: "file-1",
        sha256: "not-a-hash",
      }).success,
    ).toBe(false);
  });

  it("describes both local and Appwrite upload transports explicitly", () => {
    const common = {
      decision: "upload_required" as const,
      reservationId: "reservation-1",
      uploadJwt: "authorization",
      endpoint: "http://localhost:3000",
      projectId: "project-1",
      bucketId: "bucket-1",
      fileId: "file-1",
      expiresAt: "2026-07-28T12:00:00.000Z",
    };
    expect(
      prepareSermonUploadResponseSchema.safeParse({
        ...common,
        uploadMode: "local",
        uploadUrl: "/api/sermon-evaluation-local/uploads/reservation-1",
      }).success,
    ).toBe(true);
    expect(
      prepareSermonUploadResponseSchema.safeParse({
        ...common,
        uploadMode: "appwrite",
        uploadUrl: null,
      }).success,
    ).toBe(true);
  });

  it("rejects normalized but nonexistent calendar dates", () => {
    expect(
      createSermonEvaluationRequestSchema.safeParse({
        uploadReservationId: "upload-1",
        title: "Grace Alone",
        preacher: "Example Pastor",
        preachedOn: "2026-02-31",
        preset: "standard",
      }).success,
    ).toBe(false);
    expect(
      createSermonEvaluationRequestSchema.safeParse({
        uploadReservationId: "upload-1",
        title: "Grace Alone",
        preacher: "Example Pastor",
        preachedOn: "2024-02-29",
        preset: "standard",
      }).success,
    ).toBe(true);
  });
});

describe("sermon label capabilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const user = (labels: string[]) =>
    ({ $id: "user-1", labels }) as never;

  it("derives beta and admin access only from exact Appwrite labels", () => {
    expect(
      hasSermonEvaluationAccess(
        user(["sermon-evaluator-beta"]),
      ),
    ).toBe(true);
    expect(
      hasSermonEvaluationAccess(
        user(["sermon-evaluator-admin"]),
      ),
    ).toBe(true);
    expect(
      hasSermonEvaluationAccess(user(["sermon_evaluator_admin"])),
    ).toBe(false);
    expect(
      isSermonEvaluationAdmin(
        user(["sermon-evaluator-beta"]),
      ),
    ).toBe(false);
    expect(
      getSermonEvaluationCapabilities(
        user(["sermon-evaluator-admin"]),
      ),
    ).toEqual({
      hasAccess: true,
      isAdmin: true,
      canChooseCustomRunCount: true,
      dailyQuotaExempt: true,
      allowedRunCount: { min: 1, max: 9 },
      dailyRunLimit: 6,
    });
  });

  it("grants the configured test account admin access only in local development", () => {
    const testUser = {
      $id: "test-user",
      email: "TEST@test.com",
      labels: [],
    } as never;
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SERMON_RUNTIME", "local");
    expect(isSermonEvaluationAdmin(testUser)).toBe(true);
    expect(hasSermonEvaluationAccess(testUser)).toBe(true);

    vi.stubEnv("SERMON_RUNTIME", "appwrite");
    expect(isSermonEvaluationAdmin(testUser)).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SERMON_RUNTIME", "local");
    expect(isSermonEvaluationAdmin(testUser)).toBe(false);
  });
});

describe("sermon run selection", () => {
  it("maps regular presets to their exact credit costs", () => {
    expect(resolveRunSelection({ preset: "standard" }, false)).toEqual({
      preset: "STANDARD",
      requestedRuns: 1,
    });
    expect(
      resolveRunSelection({ preset: "high_confidence" }, false),
    ).toEqual({
      preset: "HIGH_CONFIDENCE",
      requestedRuns: 3,
    });
  });

  it("requires a current server-derived admin capability for custom runs", () => {
    expect(() =>
      resolveRunSelection(
        { preset: "custom", requestedRuns: 7 },
        false,
      ),
    ).toThrow(SermonQuotaError);
    expect(
      resolveRunSelection(
        { preset: "custom", requestedRuns: 7 },
        true,
      ),
    ).toEqual({ preset: "CUSTOM", requestedRuns: 7 });
  });
});
