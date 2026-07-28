import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSermonEvaluation,
  finalizeSermonUpload,
} from "@/components/sermon-evaluation/api";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("sermon upload client finalization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues with the canonical reservation returned by finalize", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          decision: "audio_ready",
          reservationId: "reservation-winner",
          audioAssetId: "asset-1",
          expiresAt: "2026-07-29T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          evaluation: { id: "evaluation-1" },
          detailUrl: "/sermon-evaluation/evaluation-1",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const finalized = await finalizeSermonUpload({
      reservationId: "reservation-loser",
      fileId: "file-loser",
      sha256: "a".repeat(64),
    });
    expect(finalized).toMatchObject({
      decision: "audio_ready",
      reservationId: "reservation-winner",
    });
    if (finalized.decision !== "audio_ready") {
      throw new Error("Expected finalized audio");
    }

    await createSermonEvaluation({
      reservationId: finalized.reservationId,
      title: "Sermon",
      preacher: "Pastor",
      preachedOn: "2026-07-27",
      preset: "STANDARD",
      durationAdjustmentEnabled: false,
    });

    const createRequest = fetchMock.mock.calls[1]?.[1] as
      | RequestInit
      | undefined;
    expect(JSON.parse(String(createRequest?.body))).toMatchObject({
      uploadReservationId: "reservation-winner",
    });
  });

  it("rejects audio-ready responses without a canonical reservation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          decision: "audio_ready",
          audioAssetId: "asset-1",
        }),
      ),
    );

    await expect(
      finalizeSermonUpload({
        reservationId: "reservation-loser",
        fileId: "file-loser",
        sha256: "a".repeat(64),
      }),
    ).rejects.toThrow("canonical audio reservation");
  });
});
