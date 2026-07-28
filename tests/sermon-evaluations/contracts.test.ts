import { describe, expect, it, vi } from "vitest";

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
