import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHAT_DENOMINATION,
  resolveEffectiveDenomination,
} from "./chat-context";

describe("effective chat denomination", () => {
  it("uses the authenticated profile preference before the chat fallback", () => {
    expect(
      resolveEffectiveDenomination("presbyterian", "reformed-baptist"),
    ).toBe("presbyterian");
  });

  it("uses the chat denomination when no profile preference exists", () => {
    expect(resolveEffectiveDenomination(null, "anglican")).toBe("anglican");
  });

  it("falls back to the application default when both values are absent", () => {
    expect(resolveEffectiveDenomination(null, null)).toBe(
      DEFAULT_CHAT_DENOMINATION,
    );
  });
});
