import { describe, expect, it } from "vitest";

import { chatTitleMatches, groupChatsByDate } from "./chat-list";

describe("conversation list helpers", () => {
  it("groups conversations relative to the locale's current day", () => {
    const groups = groupChatsByDate(
      [
        {
          id: "today",
          conversationName: "Today",
          modifiedAt: "2026-07-25T08:00:00.000Z",
        },
        {
          id: "week",
          conversationName: "This week",
          modifiedAt: "2026-07-22T12:00:00.000Z",
        },
        {
          id: "older",
          conversationName: "Older",
          modifiedAt: "2026-07-01T12:00:00.000Z",
        },
      ],
      new Date("2026-07-25T12:00:00.000Z"),
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Previous 7 days",
      "Older",
    ]);
    expect(groups.map((group) => group.chats[0].id)).toEqual([
      "today",
      "week",
      "older",
    ]);
  });

  it("matches titles with locale-aware case folding and diacritics", () => {
    expect(chatTitleMatches("Église fidèle", "eglise", "fr")).toBe(true);
    expect(chatTitleMatches("Istanbul", "ıstanbul", "tr")).toBe(true);
    expect(chatTitleMatches("Justification", "sanctification", "en")).toBe(false);
  });
});
