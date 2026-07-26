import type { ChatSummary } from "@/hooks/use-chat-list";

export type ChatDateGroup = {
  key: "today" | "previous-seven-days" | "older";
  label: "Today" | "Previous 7 days" | "Older";
  chats: ChatSummary[];
};

function normalizeForSearch(value: string, locale: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase(locale)
    .trim();
}

export function chatTitleMatches(
  title: string,
  query: string,
  locale = "en",
) {
  const normalizedQuery = normalizeForSearch(query, locale);
  if (!normalizedQuery) return true;
  return normalizeForSearch(title, locale).includes(normalizedQuery);
}

export function groupChatsByDate(
  chats: ChatSummary[],
  now = new Date(),
): ChatDateGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const previousSevenDays = new Date(startOfToday);
  previousSevenDays.setDate(previousSevenDays.getDate() - 7);

  const groups: ChatDateGroup[] = [
    { key: "today", label: "Today", chats: [] },
    { key: "previous-seven-days", label: "Previous 7 days", chats: [] },
    { key: "older", label: "Older", chats: [] },
  ];

  for (const chat of chats) {
    const modifiedAt = new Date(chat.modifiedAt);
    if (!Number.isFinite(modifiedAt.getTime()) || modifiedAt < previousSevenDays) {
      groups[2].chats.push(chat);
    } else if (modifiedAt < startOfToday) {
      groups[1].chats.push(chat);
    } else {
      groups[0].chats.push(chat);
    }
  }

  return groups.filter((group) => group.chats.length > 0);
}
