// lib/progressUtils.ts

type DataEvent =
  | { type: "info" | "done" }
  | { type: "error"; stage: string; message: string }
  | { type: "progress"; title: string; content: string }
  | { type: "parrot"; content: string }
  | { type: "calvin"; content: string }
  | { type: "gotQuestions"; content: string };

// Shared function for streaming progress messages.
export function sendProgress(
  data: DataEvent,
  controller?: ReadableStreamDefaultController<Uint8Array>
) {
  if (controller) {
    // If we have a stream controller, we can enqueue progress to the client:
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
  } else {
    // Otherwise, fallback to logging or some other approach:
    console.log("PROGRESS:", data);
  }
}

export function sendError(
  error: Error | unknown,
  stage: string,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  console.error(`Error during ${stage}:`, error);
  sendProgress({
    type: 'error',
    stage,
    message: 'An error occurred, but continuing conversation...'
  }, controller);
}
