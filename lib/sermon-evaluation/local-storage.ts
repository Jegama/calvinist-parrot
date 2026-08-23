import { createReadStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Permission, Role } from "node-appwrite";

import {
  getLocalSermonAudioDirectory,
  getLocalSermonBucketId,
} from "./runtime";

const FILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export type LocalSermonAudioMetadata = {
  $id: string;
  bucketId: string;
  name: string;
  mimeType: string;
  sizeOriginal: number;
  chunksUploaded: number;
  chunksTotal: number;
  $permissions: string[];
  ownerId: string;
};

function requireFileId(fileId: string) {
  if (!FILE_ID_PATTERN.test(fileId)) {
    throw new Error("Invalid local sermon audio file identifier");
  }
  return fileId;
}

function pathsFor(fileId: string) {
  const safeFileId = requireFileId(fileId);
  const directory = getLocalSermonAudioDirectory();
  return {
    directory,
    audio: path.join(
      /*turbopackIgnore: true*/ directory,
      `${safeFileId}.audio`,
    ),
    metadata: path.join(
      /*turbopackIgnore: true*/ directory,
      `${safeFileId}.json`,
    ),
  };
}

export async function writeLocalSermonAudio(input: {
  fileId: string;
  ownerId: string;
  originalFilename: string;
  mimeType: string;
  expectedByteSize: number;
  body: ReadableStream<Uint8Array>;
}) {
  const paths = pathsFor(input.fileId);
  await mkdir(/* turbopackIgnore: true */ paths.directory, {
    recursive: true,
    mode: 0o700,
  });
  const file = await open(/* turbopackIgnore: true */ paths.audio, "wx", 0o600);
  let byteSize = 0;
  try {
    const reader = input.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteSize += value.byteLength;
      if (byteSize > input.expectedByteSize) {
        throw new Error("The uploaded file exceeds its reserved byte size");
      }
      await file.write(value);
    }
    if (byteSize !== input.expectedByteSize) {
      throw new Error("The uploaded file size does not match its reservation");
    }
  } catch (error) {
    await file.close();
    await unlink(/* turbopackIgnore: true */ paths.audio).catch(() => undefined);
    throw error;
  }
  await file.close();

  const ownerRole = Role.user(input.ownerId);
  const metadata: LocalSermonAudioMetadata = {
    $id: input.fileId,
    bucketId: getLocalSermonBucketId(),
    name: input.originalFilename,
    mimeType: input.mimeType,
    sizeOriginal: byteSize,
    chunksUploaded: 1,
    chunksTotal: 1,
    $permissions: [
      Permission.read(ownerRole),
      Permission.update(ownerRole),
      Permission.delete(ownerRole),
    ],
    ownerId: input.ownerId,
  };
  try {
    await writeFile(
      /* turbopackIgnore: true */ paths.metadata,
      `${JSON.stringify(metadata)}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      },
    );
  } catch (error) {
    await unlink(/* turbopackIgnore: true */ paths.audio).catch(() => undefined);
    throw error;
  }
  return metadata;
}

export async function getLocalSermonAudioFile(fileId: string) {
  const paths = pathsFor(fileId);
  const [contents, audioStat] = await Promise.all([
    readFile(/* turbopackIgnore: true */ paths.metadata, "utf8"),
    stat(/* turbopackIgnore: true */ paths.audio),
  ]);
  const metadata = JSON.parse(contents) as LocalSermonAudioMetadata;
  if (
    metadata.$id !== fileId ||
    metadata.bucketId !== getLocalSermonBucketId() ||
    metadata.sizeOriginal !== audioStat.size
  ) {
    throw new Error("Local sermon audio metadata is invalid");
  }
  return metadata;
}

export async function deleteLocalSermonAudioFile(fileId: string) {
  const paths = pathsFor(fileId);
  await Promise.all([
    unlink(/* turbopackIgnore: true */ paths.audio).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    }),
    unlink(/* turbopackIgnore: true */ paths.metadata).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    }),
  ]);
}

export async function openLocalSermonAudioStream(fileId: string) {
  const paths = pathsFor(fileId);
  const [metadata, audioStat] = await Promise.all([
    getLocalSermonAudioFile(fileId),
    stat(/* turbopackIgnore: true */ paths.audio),
  ]);
  return {
    metadata,
    size: audioStat.size,
    stream: (start?: number, end?: number) =>
      createReadStream(/* turbopackIgnore: true */ paths.audio, { start, end }),
  };
}
