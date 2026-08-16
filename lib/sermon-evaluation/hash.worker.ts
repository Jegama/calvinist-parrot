import { createSHA256 } from "hash-wasm";

type HashRequest = {
  type: "hash";
  file: File;
};

type HashWorkerScope = {
  onmessage: ((event: MessageEvent<HashRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

const workerScope = self as unknown as HashWorkerScope;

workerScope.onmessage = async (event) => {
  if (event.data.type !== "hash") {
    return;
  }

  const { file } = event.data;
  const totalBytes = file.size;
  let processedBytes = 0;

  try {
    const hasher = await createSHA256();
    hasher.init();

    const reader = file.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      hasher.update(value);
      processedBytes += value.byteLength;
      workerScope.postMessage({
        type: "progress",
        processedBytes,
        totalBytes,
        progress: totalBytes === 0 ? 100 : Math.min(100, (processedBytes / totalBytes) * 100),
      });
    }

    workerScope.postMessage({
      type: "complete",
      sha256: hasher.digest("hex"),
      processedBytes,
      totalBytes,
      progress: 100,
    });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "The audio fingerprint could not be calculated.",
    });
  }
};

export {};
