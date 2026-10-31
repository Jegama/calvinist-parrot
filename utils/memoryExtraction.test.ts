import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  findProfile: vi.fn(),
  upsertProfile: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mocks.createCompletion } };
  },
}));
vi.mock("@/lib/prisma", () => ({
  default: {
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
    mocks.findProfile.mockResolvedValue(null);
    mocks.getMemory.mockResolvedValue(null);
    mocks.upsertProfile.mockResolvedValue({});
    mocks.updateMemory.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps structured extraction and persists the parsed memories without sampling overrides", async () => {
    mocks.createCompletion.mockResolvedValueOnce({
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
    });

    await updateUserMemoriesFromConversation("owner-1", [
      {
        sender: "user",
        content: "I am caring for my parent. How can I trust God?",
      },
      {
        sender: "parrot",
        content: "Bring your concerns to the Lord in prayer.",
      },
    ]);

    expect(mocks.createCompletion).toHaveBeenCalledOnce();
    const request = mocks.createCompletion.mock.calls[0][0];
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
    expect(mocks.createCompletion).not.toHaveBeenCalled();
    expect(mocks.updateMemory).not.toHaveBeenCalled();
  });
});
