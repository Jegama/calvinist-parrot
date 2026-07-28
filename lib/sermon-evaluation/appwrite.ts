import { Account } from "appwrite";
import {
  Client,
  Functions,
  Permission,
  Role,
  Storage,
  Tokens,
} from "node-appwrite";

import {
  APPWRITE_PROJECT_ID,
  createSessionAppwriteClient,
  getForwardedUserAgent,
  getSessionCookieValue,
} from "@/lib/appwrite/server";

import {
  deleteLocalSermonAudioFile,
  getLocalSermonAudioFile,
} from "./local-storage";
import {
  getLocalSermonBucketId,
  isLocalSermonRuntime,
} from "./runtime";
import { SERMON_PLAYBACK_TOKEN_TTL_MS } from "./types";

const endpoint =
  process.env.APPWRITE_ENDPOINT ?? process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const apiKey = process.env.APPWRITE_API_KEY;
const functionId = process.env.APPWRITE_SERMON_FUNCTION_ID;
const bucketId = process.env.APPWRITE_SERMON_BUCKET_ID;

function requireConfiguration(value: string | undefined, name: string) {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim().replace(/\/$/, "");
}

export function getSermonAppwriteConfiguration() {
  if (isLocalSermonRuntime()) {
    return {
      endpoint: (process.env.APP_URL || "http://localhost:3000").replace(
        /\/$/,
        "",
      ),
      projectId: "local-development",
      apiKey: "local-development",
      functionId: "local-sermon-worker",
      bucketId: getLocalSermonBucketId(),
    };
  }
  return {
    endpoint: requireConfiguration(
      endpoint,
      "APPWRITE_ENDPOINT or NEXT_PUBLIC_APPWRITE_ENDPOINT",
    ),
    projectId: APPWRITE_PROJECT_ID,
    apiKey: requireConfiguration(apiKey, "APPWRITE_API_KEY"),
    functionId: requireConfiguration(
      functionId,
      "APPWRITE_SERMON_FUNCTION_ID",
    ),
    bucketId: requireConfiguration(bucketId, "APPWRITE_SERMON_BUCKET_ID"),
  };
}

function createAdminClient() {
  const config = getSermonAppwriteConfiguration();
  return new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey);
}

export async function createSermonUploadJwt() {
  if (isLocalSermonRuntime()) {
    return "local-development";
  }
  const sessionSecret = await getSessionCookieValue();
  if (!sessionSecret) {
    throw new Error("Authenticated Appwrite session is required");
  }
  const account = new Account(
    createSessionAppwriteClient(
      sessionSecret,
      await getForwardedUserAgent(),
    ),
  );
  return (await account.createJWT()).jwt;
}

export async function getSermonAudioFile(fileId: string) {
  if (isLocalSermonRuntime()) {
    return getLocalSermonAudioFile(fileId);
  }
  const { bucketId: configuredBucketId } =
    getSermonAppwriteConfiguration();
  return new Storage(createAdminClient()).getFile({
    bucketId: configuredBucketId,
    fileId,
  });
}

export async function deleteSermonAudioFile(fileId: string) {
  if (isLocalSermonRuntime()) {
    await deleteLocalSermonAudioFile(fileId);
    return;
  }
  const { bucketId: configuredBucketId } =
    getSermonAppwriteConfiguration();
  await new Storage(createAdminClient()).deleteFile({
    bucketId: configuredBucketId,
    fileId,
  });
}

export function hasOwnerOnlyFilePermissions(
  permissions: string[],
  ownerId: string,
) {
  const role = Role.user(ownerId);
  const allowed = new Set([
    Permission.read(role),
    Permission.write(role),
    Permission.update(role),
    Permission.delete(role),
  ]);
  const requiredRead = Permission.read(role);
  const hasMutationPermission =
    permissions.includes(Permission.write(role)) ||
    (permissions.includes(Permission.update(role)) &&
      permissions.includes(Permission.delete(role)));
  return (
    permissions.length > 0 &&
    permissions.every((permission) => allowed.has(permission)) &&
    permissions.includes(requiredRead) &&
    hasMutationPermission
  );
}

export async function invokeSermonEvaluationWorker(
  payload:
    | { action: "evaluate"; evaluationId: string }
    | { action: "regenerate_reports"; evaluationId: string },
) {
  if (isLocalSermonRuntime()) {
    return {
      local: true,
      queued: true,
      evaluationId: payload.evaluationId,
      action: payload.action,
    };
  }
  const config = getSermonAppwriteConfiguration();
  const invocationBody =
    payload.action === "evaluate"
      ? { evaluationId: payload.evaluationId }
      : payload;
  return new Functions(createAdminClient()).createExecution({
    functionId: config.functionId,
    body: JSON.stringify(invocationBody),
    async: true,
    headers: { "content-type": "application/json" },
  });
}

export async function createSermonPlaybackUrl(fileId: string) {
  const config = getSermonAppwriteConfiguration();
  const expiresAt = new Date(Date.now() + SERMON_PLAYBACK_TOKEN_TTL_MS);
  if (isLocalSermonRuntime()) {
    return {
      url: `${config.endpoint}/api/sermon-evaluation-local/audio/${encodeURIComponent(fileId)}`,
      expiresAt,
    };
  }
  const token = await new Tokens(createAdminClient()).createFileToken({
    bucketId: config.bucketId,
    fileId,
    expire: expiresAt.toISOString(),
  });
  const url = new URL(
    `${config.endpoint}/storage/buckets/${encodeURIComponent(config.bucketId)}/files/${encodeURIComponent(fileId)}/view`,
  );
  url.searchParams.set("project", config.projectId);
  url.searchParams.set("token", token.secret);
  return { url: url.toString(), expiresAt };
}
