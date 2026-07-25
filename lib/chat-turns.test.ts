import { describe, expect, it } from "vitest";

import {
  groupChatMessagesIntoTurns,
  selectBranchPrefix,
  type ChatMessageRecord,
} from "./chat-turns";

function message(
  id: string,
  sender: string,
  content: string,
  requestId?: string | null,
): ChatMessageRecord {
  return { id, sender, content, requestId };
}

describe("chat turn grouping", () => {
  it("associates every request-ID artifact with the correct turn", () => {
    const turns = groupChatMessagesIntoTurns([
      message("u1", "user", "First", "request-1"),
      message("s1", "tool_summary", "Source one", "request-1"),
      message("a1", "parrot", "Answer one", "request-1"),
      message("u2", "user", "Second", "request-2"),
      message("e2", "system_error", "Failed", "request-2"),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].user?.id).toBe("u1");
    expect(turns[0].sources.map((source) => source.id)).toEqual(["s1"]);
    expect(turns[0].assistant?.id).toBe("a1");
    expect(turns[1].user?.id).toBe("u2");
    expect(turns[1].failure?.id).toBe("e2");
    expect(turns[1].assistant).toBeNull();
  });

  it("groups contiguous legacy sources with the assistant that follows", () => {
    const turns = groupChatMessagesIntoTurns([
      message("u1", "user", "Legacy question"),
      message("g1", "gotQuestions", "Research"),
      message("c1", "CCEL", "Classic source"),
      message("a1", "parrot", "Legacy answer"),
      message("u2", "user", "Next question"),
      message("a2", "parrot", "Next answer"),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].sources.map((source) => source.id)).toEqual(["g1", "c1"]);
    expect(turns[0].assistant?.id).toBe("a1");
    expect(turns[1].assistant?.id).toBe("a2");
  });
});

describe("branch prefix selection", () => {
  const transcript = [
    message("u1", "user", "First", "r1"),
    message("a1", "parrot", "First answer", "r1"),
    message("u2", "user", "Second", "r2"),
    message("a2", "parrot", "Second answer", "r2"),
  ];

  it("copies only messages before the selected user message", () => {
    expect(selectBranchPrefix(transcript, "u2").map((row) => row.id)).toEqual([
      "u1",
      "a1",
    ]);
  });

  it("rejects non-user and missing selections", () => {
    expect(() => selectBranchPrefix(transcript, "a1")).toThrow();
    expect(() => selectBranchPrefix(transcript, "missing")).toThrow();
  });
});
