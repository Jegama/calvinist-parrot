import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => vi.stubEnv("OPENAI_API_KEY", "fixture-key"));

const mocks = vi.hoisted(() => ({
  transport: vi.fn<typeof fetch>(),
  upsertAttempt: vi.fn(),
  findProfile: vi.fn(),
  upsertProfile: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    providerCallAttempt: { upsert: mocks.upsertAttempt },
    userProfile: {
      findUnique: mocks.findProfile,
      upsert: mocks.upsertProfile,
    },
  },
}));
vi.mock("@/lib/langGraphStore", () => ({
  getUserProfile: mocks.getMemory,
  updateUserProfile: mocks.updateMemory,
}));

import { extractionSchema } from "@/lib/prompts/memory";
import { updateUserMemoriesFromConversation } from "./memoryExtraction";

describe("GPT-6 Luna memory extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.transport);
    mocks.findProfile.mockResolvedValue(null);
    mocks.getMemory.mockResolvedValue(null);
    mocks.upsertProfile.mockResolvedValue({});
    mocks.updateMemory.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps structured extraction and persists the parsed memories without sampling overrides", async () => {
    mocks.transport.mockResolvedValueOnce(Response.json({ error: { message: "Try again", model: "gpt-6-luna", usage: { prompt_tokens: 2, completion_tokens: 0 } } }, {
      status: 429, headers: { "retry-after-ms": "1" },
    }));
    mocks.transport.mockResolvedValueOnce(Response.json({
      model: "gpt-6-luna-2026-11-25",
      usage: { prompt_tokens: 14, completion_tokens: 7 },
      choices: [
        {
          message: {
            content: JSON.stringify({
              personalContext: { concerns: ["Caring for a parent"] },
              questionPatterns: { coreDoctrineQuestions: 1 },
            }),
          },
        },
      ],
    }));

    await updateUserMemoriesFromConversation("owner-1", [
      {
        sender: "user",
        content: "I am caring for my parent. How can I trust God?",
      },
      {
        sender: "parrot",
        content: "Bring your concerns to the Lord in prayer.",
      },
    ], { operationId: "opaque-turn" });

    expect(mocks.transport).toHaveBeenCalledTimes(2);
    const receipts = mocks.upsertAttempt.mock.calls.map(([write]) => write.create).filter(receipt => receipt.outcome !== "started");
    expect(receipts).toMatchObject([
      { operationId: "opaque-turn", stage: "memory", outcome: "provider_error", isRetry: false, inputTokens: 2 },
      { operationId: "opaque-turn", stage: "memory", outcome: "success", isRetry: true,
        returnedModel: "gpt-6-luna-2026-11-25", inputTokens: 14, outputTokens: 7 },
    ]);
    expect(receipts[0].attemptId).not.toBe(receipts[1].attemptId);
    expect(JSON.stringify(receipts)).not.toContain("parent");
    const request = JSON.parse(String(mocks.transport.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      model: "gpt-6-luna",
      reasoning_effort: "none",
      response_format: { type: "json_schema", json_schema: extractionSchema },
    });
    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("top_p");
    expect(request.messages.at(-1)).toMatchObject({
      role: "user",
      content: expect.stringContaining("User: I am caring for my parent."),
    });
    expect(mocks.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { appwriteUserId: "owner-1" },
        update: { coreDoctrineQuestions: { increment: 1 } },
      }),
    );
    expect(mocks.updateMemory).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        personalContext: expect.objectContaining({
          concerns: ["Caring for a parent"],
        }),
      }),
    );
  });

  it("does not invoke extraction for an empty conversation", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await updateUserMemoriesFromConversation("owner-1", []);
    expect(mocks.transport).not.toHaveBeenCalled();
    expect(mocks.upsertAttempt).not.toHaveBeenCalled();
    expect(mocks.updateMemory).not.toHaveBeenCalled();
  });
});
