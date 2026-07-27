import {
  chatStreamEventSchema,
  qaStreamEventSchema,
  type ChatStreamEvent,
  type QaStreamEvent,
} from "@/lib/api/contracts";

type StreamController = ReadableStreamDefaultController<Uint8Array>;

function enqueueNdjson(
  data: unknown,
  controller?: StreamController,
) {
  if (!controller) {
    console.log("PROGRESS:", data);
    return;
  }

  controller.enqueue(
    new TextEncoder().encode(`${JSON.stringify(data)}\n`),
  );
}

/**
 * Emits one contract-validated chat event. Keeping validation at the stream
 * boundary prevents runtime event shapes from drifting from OpenAPI.
 */
export function sendProgress(
  data: ChatStreamEvent,
  controller?: StreamController,
) {
  enqueueNdjson(chatStreamEventSchema.parse(data), controller);
}

/**
 * Emits one contract-validated Parrot QA event.
 */
export function sendQaProgress(
  data: QaStreamEvent,
  controller?: StreamController,
) {
  enqueueNdjson(qaStreamEventSchema.parse(data), controller);
}

export function sendError(
  error: Error | unknown,
  stage: string,
  controller: StreamController,
  requestId: string,
) {
  console.error(`Error during ${stage}:`, error);
  sendProgress(
    {
      type: "error",
      stage,
      message: "An error occurred, but continuing conversation...",
      requestId,
    },
    controller,
  );
}
