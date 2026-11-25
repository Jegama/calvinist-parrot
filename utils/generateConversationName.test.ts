import { afterEach, describe, expect, it, vi } from "vitest";

import { generateConversationName } from "./generateConversationName";

const upsert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ default: { providerCallAttempt: { upsert } } }));
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

describe("conversation title billing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("includes an invalid billed response and a distinct successful retry under the same turn", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fixture-key");
    const transport = vi.fn<typeof fetch>();
    for (const name of ["   ", "Grace"]) {
      transport.mockResolvedValueOnce(Response.json({
        modelVersion: "gemini-4-hydrogen",
        usageMetadata: { promptTokenCount: 13, candidatesTokenCount: 3 },
        candidates: [{ content: { parts: [{ text: JSON.stringify({ name }) }] } }],
      }));
    }
    vi.stubGlobal("fetch", transport);
    await expect(generateConversationName("private input", { operationId: "opaque-turn" })).resolves.toBe("Grace");
    const writes = upsert.mock.calls.map(([write]) => write.create).filter(receipt => ["invalid_output", "success"].includes(receipt.outcome));
    expect(writes).toMatchObject([
      { feature: "chat", stage: "title", operationId: "opaque-turn", isRetry: false, outcome: "invalid_output", inputTokens: 13 },
      { feature: "chat", stage: "title", operationId: "opaque-turn", isRetry: true, outcome: "success", outputTokens: 3 },
    ]);
    expect(writes[0].attemptId).not.toBe(writes[1].attemptId);
    expect(JSON.stringify(writes)).not.toContain("private input");
  });
});
