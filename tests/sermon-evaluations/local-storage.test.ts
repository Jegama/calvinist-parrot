import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteLocalSermonAudioFile,
  getLocalSermonAudioFile,
  openLocalSermonAudioStream,
  writeLocalSermonAudio,
} from "@/lib/sermon-evaluation/local-storage";

describe("local sermon audio storage", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "sermon-storage-"));
    vi.stubEnv("SERMON_LOCAL_AUDIO_DIR", directory);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("streams exact reserved bytes and preserves owner-only metadata", async () => {
    const bytes = new TextEncoder().encode("fixture audio");
    const metadata = await writeLocalSermonAudio({
      fileId: "audio-file-1",
      ownerId: "owner-1",
      originalFilename: "sermon.wav",
      mimeType: "audio/wav",
      expectedByteSize: bytes.byteLength,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 4));
          controller.enqueue(bytes.slice(4));
          controller.close();
        },
      }),
    });

    expect(metadata.ownerId).toBe("owner-1");
    expect(metadata.$permissions).toEqual([
      'read("user:owner-1")',
      'update("user:owner-1")',
      'delete("user:owner-1")',
    ]);
    await expect(getLocalSermonAudioFile("audio-file-1")).resolves.toEqual(
      metadata,
    );
    expect(
      await readFile(path.join(directory, "audio-file-1.audio"), "utf8"),
    ).toBe("fixture audio");
    const opened = await openLocalSermonAudioStream("audio-file-1");
    expect(opened.size).toBe(bytes.byteLength);

    await deleteLocalSermonAudioFile("audio-file-1");
    await expect(getLocalSermonAudioFile("audio-file-1")).rejects.toThrow();
  });

  it("rejects traversal and incomplete uploads without retaining bytes", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.close();
      },
    });
    await expect(
      writeLocalSermonAudio({
        fileId: "../escape",
        ownerId: "owner-1",
        originalFilename: "sermon.wav",
        mimeType: "audio/wav",
        expectedByteSize: 2,
        body,
      }),
    ).rejects.toThrow("Invalid local sermon audio file identifier");

    await expect(
      writeLocalSermonAudio({
        fileId: "short-file",
        ownerId: "owner-1",
        originalFilename: "sermon.wav",
        mimeType: "audio/wav",
        expectedByteSize: 3,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.close();
          },
        }),
      }),
    ).rejects.toThrow("does not match");
    await expect(
      readFile(path.join(directory, "short-file.audio")),
    ).rejects.toThrow();
  });
});
