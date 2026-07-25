export const MAX_CONVERSATION_TITLE_LENGTH = 72;

export function deterministicConversationTitle(currentConversation: string) {
  const mostRecentUserMessage =
    currentConversation
      .split("\n")
      .reverse()
      .find((line) => /^\s*user\s*:/i.test(line))
      ?.replace(/^\s*user\s*:\s*/i, "") ?? currentConversation;
  const normalized = mostRecentUserMessage
    .replace(/[#>*_`[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "New Conversation";

  const words = normalized.split(" ");
  const shortTitle = words.slice(0, 9).join(" ");
  const hasMore =
    words.length > 9 || shortTitle.length > MAX_CONVERSATION_TITLE_LENGTH;
  return `${shortTitle
    .slice(0, MAX_CONVERSATION_TITLE_LENGTH - (hasMore ? 1 : 0))
    .trim()}${hasMore ? "…" : ""}`;
}
