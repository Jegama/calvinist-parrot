type RequestMessage = {
  sender: string;
  requestId?: string | null;
};

export type RetryDecision = "retryable" | "already_succeeded" | "missing_user";

export function evaluateRetry(
  messages: RequestMessage[],
  requestId: string,
): RetryDecision {
  const requestMessages = messages.filter((message) => message.requestId === requestId);

  if (requestMessages.some((message) => message.sender === "parrot")) {
    return "already_succeeded";
  }

  if (!requestMessages.some((message) => message.sender === "user")) {
    return "missing_user";
  }

  return "retryable";
}
