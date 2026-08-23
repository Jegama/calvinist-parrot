import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UploadAuthorization } from "@/components/sermon-evaluation/types";

const mocks = vi.hoisted(() => ({
  createFile: vi.fn(),
  setEndpoint: vi.fn(),
  setJWT: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock("appwrite", () => ({
  Client: class {
    setEndpoint(value: string) {
      mocks.setEndpoint(value);
      return this;
    }

    setProject(value: string) {
      mocks.setProject(value);
      return this;
    }

    setJWT(value: string) {
      mocks.setJWT(value);
      return this;
    }
  },
  Storage: class {
    createFile(...args: unknown[]) {
      return mocks.createFile(...args);
    }
  },
}));

import { uploadSermonAudioDirectly } from "@/components/sermon-evaluation/upload";

const permissions = [
  'read("user:server-owner")',
  'update("user:server-owner")',
  'delete("user:server-owner")',
];

const authorization: UploadAuthorization = {
  reservationId: "reservation-1",
  mode: "appwrite",
  jwt: "upload-jwt",
  bucketId: "bucket-1",
  fileId: "file-1",
  endpoint: "https://cloud.appwrite.io/v1",
  projectId: "project-1",
  permissions,
};

describe("sermon upload authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFile.mockResolvedValue({ $id: "file-1" });
  });

  it("passes only the server-authorized permissions to Appwrite", async () => {
    const file = new File(["audio"], "sermon.mp3", {
      type: "audio/mpeg",
    });

    await expect(
      uploadSermonAudioDirectly({
        authorization,
        file,
        onProgress: vi.fn(),
      }),
    ).resolves.toBe("file-1");

    expect(mocks.createFile).toHaveBeenCalledWith(
      "bucket-1",
      "file-1",
      file,
      permissions,
      expect.any(Function),
    );
  });

  it("fails closed when the server omits private permissions", async () => {
    await expect(
      uploadSermonAudioDirectly({
        authorization: { ...authorization, permissions: [] },
        file: new File(["audio"], "sermon.mp3", {
          type: "audio/mpeg",
        }),
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("server did not provide private upload permissions");
    expect(mocks.createFile).not.toHaveBeenCalled();
  });
});
