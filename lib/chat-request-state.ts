export type RequestTerminalState =
  | "open"
  | "completed"
  | "stopped"
  | "failed";

type RequestMessage = {
  sender: string;
};

export function getRequestTerminalState(
  messages: RequestMessage[],
): RequestTerminalState {
  if (messages.some((message) => message.sender === "parrot")) {
    return "completed";
  }
  if (messages.some((message) => message.sender === "system_stopped")) {
    return "stopped";
  }
  if (messages.some((message) => message.sender === "system_error")) {
    return "failed";
  }
  return "open";
}

export function selectTerminalSafeMessages<T extends RequestMessage>(
  pendingMessages: T[],
  existingState: RequestTerminalState,
  stopRequested: boolean,
): T[] {
  let selectedTerminalMessage = existingState !== "open";

  return pendingMessages.filter((message) => {
    const isCompletedMessage = message.sender === "parrot";
    const isStoppedMessage = message.sender === "system_stopped";
    const isFailureMessage = message.sender === "system_error";

    if (!isCompletedMessage && !isStoppedMessage && !isFailureMessage) {
      return true;
    }
    if (selectedTerminalMessage) {
      return false;
    }
    if (stopRequested ? !isStoppedMessage : isStoppedMessage) {
      return false;
    }

    selectedTerminalMessage = true;
    return true;
  });
}
