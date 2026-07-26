import { describe, expect, it } from "vitest";

import {
  getRequestTerminalState,
  selectTerminalSafeMessages,
} from "./chat-request-state";

describe("chat request terminal state", () => {
  it("treats a completed answer as terminal", () => {
    expect(
      getRequestTerminalState([
        { sender: "user" },
        { sender: "system_stopped" },
        { sender: "parrot" },
      ]),
    ).toBe("completed");
  });

  it("drops a queued answer after a stop has already won", () => {
    expect(
      selectTerminalSafeMessages(
        [
          { sender: "tool_summary", content: "Source" },
          { sender: "parrot", content: "Completed answer" },
        ],
        "stopped",
        false,
      ),
    ).toEqual([{ sender: "tool_summary", content: "Source" }]);
  });

  it("persists the stop marker instead of a queued answer when stopping wins", () => {
    expect(
      selectTerminalSafeMessages(
        [
          { sender: "tool_summary", content: "Source" },
          { sender: "parrot", content: "Completed answer" },
          { sender: "system_stopped", content: "Stopped" },
        ],
        "open",
        true,
      ),
    ).toEqual([
      { sender: "tool_summary", content: "Source" },
      { sender: "system_stopped", content: "Stopped" },
    ]);
  });

  it("does not add a stop marker after completion has already won", () => {
    expect(
      selectTerminalSafeMessages(
        [{ sender: "system_stopped", content: "Stopped" }],
        "completed",
        true,
      ),
    ).toEqual([]);
  });

  it("does not persist a later failure after completion has already won", () => {
    expect(
      selectTerminalSafeMessages(
        [{ sender: "system_error", content: "Failed" }],
        "completed",
        false,
      ),
    ).toEqual([]);
  });
});
