"use client";

import { Client, Permission, Role, Storage } from "appwrite";
import type { UploadAuthorization } from "./types";

export async function uploadSermonAudioDirectly(input: {
  authorization: UploadAuthorization;
  file: File;
  ownerId: string;
  onProgress: (progress: number) => void;
}): Promise<string> {
  const endpoint = input.authorization.endpoint ?? process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId = input.authorization.projectId ?? process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  if (!endpoint || !projectId) {
    throw new Error("Sermon audio storage is not configured for this environment.");
  }
  if (!input.authorization.jwt || !input.authorization.bucketId || !input.authorization.fileId) {
    throw new Error("The upload authorization is incomplete. Please start the upload again.");
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setJWT(input.authorization.jwt);
  const storage = new Storage(client);
  const permissions =
    input.authorization.permissions && input.authorization.permissions.length > 0
      ? input.authorization.permissions
      : [
          Permission.read(Role.user(input.ownerId)),
          Permission.update(Role.user(input.ownerId)),
          Permission.delete(Role.user(input.ownerId)),
        ];

  const uploaded = await storage.createFile(
    input.authorization.bucketId,
    input.authorization.fileId,
    input.file,
    permissions,
    (progress) => input.onProgress(Math.max(0, Math.min(100, progress.progress))),
  );
  return uploaded.$id;
}

