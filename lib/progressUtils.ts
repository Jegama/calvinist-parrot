// lib/progressUtils.ts

type RequestEvent = { requestId?: string };

type DataEvent =
  | ({ type: "info" | "done" | "stopped" } & RequestEvent)
  | ({ type: "error"; stage: string; message: string } & RequestEvent)
  | ({ type: "progress"; title: string; content: string } & RequestEvent)
  | ({ type: "tool_progress"; toolName: string; message: string } & RequestEvent)
  | ({ type: "tool_summary"; toolName: string; content: string } & RequestEvent)
  | ({ type: "parrot"; content: string } & RequestEvent)
  | ({ type: "calvin"; content: string } & RequestEvent)
  | ({ type: "gotQuestions"; content: string } & RequestEvent)
  | ({ type: "CCEL"; content: string } & RequestEvent)
  | ({ type: "conversationNameUpdated"; chatId: string; name: string } & RequestEvent);

// Shared function for streaming progress messages.
export function sendProgress(data: DataEvent, controller?: ReadableStreamDefaultController<Uint8Array>) {
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
  controller: ReadableStreamDefaultController<Uint8Array>,
  requestId?: string,
) {
  console.error(`Error during ${stage}:`, error);
  sendProgress(
    {
      type: "error",
      stage,
      message: "An error occurred, but continuing conversation...",
      requestId,
    },
    controller
  );
}
