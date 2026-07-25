import { describe, expect, it } from "vitest";

import { evaluateRetry } from "./chat-requests";

describe("retry idempotency", () => {
  it("allows retry only when the user request exists without a successful answer", () => {
    expect(
      evaluateRetry(
        [
          { sender: "user", requestId: "request-1" },
          { sender: "tool_summary", requestId: "request-1" },
          { sender: "system_error", requestId: "request-1" },
        ],
        "request-1",
      ),
    ).toBe("retryable");
  });

  it("rejects retry after a successful assistant response", () => {
    expect(
      evaluateRetry(
        [
          { sender: "user", requestId: "request-1" },
          { sender: "parrot", requestId: "request-1" },
        ],
        "request-1",
      ),
    ).toBe("already_succeeded");
  });

  it("rejects a retry request without its original user message", () => {
    expect(
      evaluateRetry(
        [{ sender: "system_error", requestId: "request-1" }],
        "request-1",
      ),
    ).toBe("missing_user");
  });
});
