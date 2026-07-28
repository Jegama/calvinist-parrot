"use client";

import { Client, Permission, Role, Storage } from "appwrite";
import type { UploadAuthorization } from "./types";

async function uploadToLocalRuntime(input: {
  authorization: UploadAuthorization;
  file: File;
  onProgress: (progress: number) => void;
}) {
  if (!input.authorization.uploadUrl) {
    throw new Error("The local upload authorization is incomplete.");
  }
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", input.authorization.uploadUrl!);
    request.withCredentials = true;
    request.setRequestHeader("content-type", input.file.type || "application/octet-stream");
    request.setRequestHeader("x-sermon-file-id", input.authorization.fileId);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        input.onProgress(
          Math.max(0, Math.min(100, (event.loaded / event.total) * 100)),
        );
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        input.onProgress(100);
        resolve(input.authorization.fileId);
        return;
      }
      let message = "The local sermon audio upload failed.";
      try {
        const payload = JSON.parse(request.responseText) as { error?: unknown };
        if (typeof payload.error === "string") message = payload.error;
      } catch {
        // Keep the stable fallback for non-JSON failures.
      }
      reject(new Error(message));
    });
    request.addEventListener("error", () =>
      reject(new Error("The local sermon audio upload could not reach the server.")),
    );
    request.addEventListener("abort", () =>
      reject(new Error("The local sermon audio upload was canceled.")),
    );
    request.send(input.file);
  });
}

export async function uploadSermonAudioDirectly(input: {
  authorization: UploadAuthorization;
  file: File;
  ownerId: string;
  onProgress: (progress: number) => void;
}): Promise<string> {
  if (input.authorization.mode === "local") {
    return uploadToLocalRuntime(input);
  }
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
