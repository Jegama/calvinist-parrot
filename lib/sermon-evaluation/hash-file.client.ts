"use client";

export type HashFileProgress = {
  processedBytes: number;
  totalBytes: number;
  progress: number;
};

type WorkerProgressMessage = HashFileProgress & { type: "progress" };
type WorkerCompleteMessage = HashFileProgress & { type: "complete"; sha256: string };
type WorkerErrorMessage = { type: "error"; message: string };
type WorkerMessage = WorkerProgressMessage | WorkerCompleteMessage | WorkerErrorMessage;

export function hashFileIncrementally(
  file: File,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: HashFileProgress) => void;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./hash.worker.ts", import.meta.url), {
      name: "sermon-audio-sha256",
      type: "module",
    });

    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      worker.terminate();
      options?.signal?.removeEventListener("abort", handleAbort);
      callback();
    };

    const handleAbort = () => {
      finish(() => reject(new DOMException("Audio fingerprinting was canceled.", "AbortError")));
    };

    if (options?.signal?.aborted) {
      handleAbort();
      return;
    }

    options?.signal?.addEventListener("abort", handleAbort, { once: true });
    worker.onerror = () => {
      finish(() => reject(new Error("The browser could not start secure audio fingerprinting.")));
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        options?.onProgress?.(message);
        return;
      }
      if (message.type === "complete") {
        options?.onProgress?.(message);
        finish(() => resolve(message.sha256));
        return;
      }
      finish(() => reject(new Error(message.message)));
    };

    worker.postMessage({ type: "hash", file });
  });
}
