export type ChatMessageRecord = {
  id: string;
  sender: string;
  content: string;
  requestId?: string | null;
  timestamp?: string | Date;
  toolName?: string;
};

export type ChatTurn = {
  key: string;
  requestId: string | null;
  user: ChatMessageRecord | null;
  sources: ChatMessageRecord[];
  assistant: ChatMessageRecord | null;
  failure: ChatMessageRecord | null;
  stopped: ChatMessageRecord | null;
  firstMessageIndex: number;
};

function createTurn(key: string, requestId: string | null, firstMessageIndex: number): ChatTurn {
  return {
    key,
    requestId,
    user: null,
    sources: [],
    assistant: null,
    failure: null,
    stopped: null,
    firstMessageIndex,
  };
}

function addMessageToTurn(turn: ChatTurn, message: ChatMessageRecord) {
  switch (message.sender) {
    case "user":
      turn.user ??= message;
      break;
    case "tool_summary":
    case "gotQuestions":
    case "CCEL":
      turn.sources.push(message);
      break;
    case "parrot":
      turn.assistant = message;
      break;
    case "calvin":
      if (!turn.assistant) {
        turn.assistant = message;
      } else {
        turn.sources.push({
          ...message,
          sender: "tool_summary",
          toolName: message.toolName ?? "Calvin's Feedback",
        });
      }
      break;
    case "system_error":
      turn.failure = message;
      break;
    case "system_stopped":
      turn.stopped = message;
      break;
    default:
      if (!turn.assistant) {
        turn.assistant = message;
      }
      break;
  }
}

/**
 * Groups persisted and streaming rows into request/response turns.
 *
 * New rows use requestId for exact association. Legacy rows are grouped by
 * contiguous user → tool summary → assistant/error order.
 */
export function groupChatMessagesIntoTurns(messages: ChatMessageRecord[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const requestTurns = new Map<string, ChatTurn>();
  let legacyTurn: ChatTurn | null = null;
  let legacySequence = 0;

  messages.forEach((message, index) => {
    if (message.requestId) {
      legacyTurn = null;
      let turn = requestTurns.get(message.requestId);
      if (!turn) {
        turn = createTurn(`request:${message.requestId}`, message.requestId, index);
        requestTurns.set(message.requestId, turn);
        turns.push(turn);
      }
      addMessageToTurn(turn, message);
      return;
    }

    const needsNewLegacyTurn =
      !legacyTurn ||
      message.sender === "user" ||
      (message.sender === "parrot" && Boolean(legacyTurn.assistant)) ||
      (message.sender === "tool_summary" &&
        Boolean(legacyTurn.assistant || legacyTurn.failure || legacyTurn.stopped));

    if (needsNewLegacyTurn) {
      legacyTurn = createTurn(`legacy:${legacySequence++}`, null, index);
      turns.push(legacyTurn);
    }

    addMessageToTurn(legacyTurn!, message);
  });

  return turns.sort((a, b) => a.firstMessageIndex - b.firstMessageIndex);
}

export function selectBranchPrefix(
  messages: ChatMessageRecord[],
  selectedUserMessageId: string,
): ChatMessageRecord[] {
  const selectedIndex = messages.findIndex(
    (message) => message.id === selectedUserMessageId && message.sender === "user",
  );

  if (selectedIndex < 0) {
    throw new Error("The selected user message was not found.");
  }

  return messages.slice(0, selectedIndex);
}
