import { describe, expect, it } from "vitest";

import { deterministicConversationTitle } from "../lib/chat-title";

describe("deterministic conversation title fallback", () => {
  it("uses the most recent user message and stays concise", () => {
    const title = deterministicConversationTitle(
      "user: What is justification?\nparrot: An answer\nuser: How does adoption relate to union with Christ and sanctification over time?",
    );

    expect(title).toBe(
      "How does adoption relate to union with Christ and…",
    );
    expect(title.length).toBeLessThanOrEqual(72);
  });

  it("returns a stable fallback for empty content", () => {
    expect(deterministicConversationTitle("")).toBe("New Conversation");
  });
});
