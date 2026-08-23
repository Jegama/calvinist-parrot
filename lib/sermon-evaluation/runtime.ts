import path from "node:path";

export type SermonRuntime = "local" | "appwrite";

const LOCAL_BUCKET_ID = "local-sermon-audio";

export function getSermonRuntime(): SermonRuntime {
  const configured = process.env.SERMON_RUNTIME?.trim().toLowerCase();
  if (configured === "local" || configured === "appwrite") {
    return configured;
  }
  if (configured) {
    throw new Error("SERMON_RUNTIME must be either local or appwrite");
  }
  return process.env.NODE_ENV === "development" ? "local" : "appwrite";
}

export function isLocalSermonRuntime() {
  return getSermonRuntime() === "local";
}

export function getLocalSermonBucketId() {
  return LOCAL_BUCKET_ID;
}

export function getLocalSermonAudioDirectory() {
  const configured = process.env.SERMON_LOCAL_AUDIO_DIR?.trim();
  return path.resolve(
    /*turbopackIgnore: true*/ configured ||
      path.join(process.cwd(), ".data", "sermon-audio"),
  );
}
