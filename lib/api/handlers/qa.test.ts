import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completionCreate: vi.fn(),
  questionHistoryCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    chat = {
      completions: {
        create: mocks.completionCreate,
      },
    };
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    questionHistory: {
      create: mocks.questionHistoryCreate,
    },
  },
}));

vi.mock("@/lib/guest", () => ({
  resolveChatActor: vi.fn(async () => ({
    kind: "authenticated",
    userId: "owner-1",
  })),
  getChatActorId: vi.fn(() => "owner-1"),
}));

vi.mock("@/utils/langChainAgents/mainAgent", () => ({
  getParrotWorkflow: vi.fn(),
}));

vi.mock("@/utils/langChainAgents/tools", () => ({
  toolsArray: [],
}));

vi.mock("@/utils/generateConversationName", () => ({
  generateConversationName: vi.fn(),
}));

vi.mock("@/utils/memoryExtraction", () => ({
  updateUserMemoriesFromConversation: vi.fn(),
}));

vi.mock("@/utils/buildParrotSystemPrompt", () => ({
  buildParrotSystemPrompt: vi.fn(),
}));

import {
  handleLegacyQaPost,
  handleQa,
  executeQa,
  type QaCommand,
} from "./qa";

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("QA API adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves external userId only in the deprecated legacy adapter", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const execute = vi.fn(
      async (...[, contentType]: [QaCommand, string?]) =>
        new Response("", {
          headers: contentType
            ? { "Content-Type": contentType }
            : undefined,
        }),
    );

    const response = await handleLegacyQaPost(
      jsonRequest({
        question: "What is justification?",
        denomination: "lutheran",
        userId: "integration-user",
      }),
      execute,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("Deprecation")).toBe("@1785024000");
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: "deprecated_api_request",
      route: "/api/parrot-qa",
      method: "POST",
      replacement: "/api/v1/qa",
    });
    expect(execute).toHaveBeenCalledWith(
      {
        question: "What is justification?",
        denomination: "lutheran",
        externalUserId: "integration-user",
      },
      "text/plain; charset=utf-8",
    );
  });

  it("rejects caller identity in v1 and preserves NDJSON for valid requests", async () => {
    const execute = vi.fn(
      async () =>
        new Response('{"type":"done"}\n', {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
          },
        }),
    );

    const invalid = await handleQa(
      jsonRequest({
        question: "What is justification?",
        userId: "caller-controlled",
      }),
      execute,
    );
    expect(invalid.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();

    const valid = await handleQa(
      jsonRequest({
        question: "What is justification?",
        denomination: "lutheran",
      }),
      execute,
    );
    expect(valid.status).toBe(200);
    expect(valid.headers.get("Content-Type")).toContain(
      "application/x-ndjson",
    );
    expect(execute).toHaveBeenCalledWith({
      question: "What is justification?",
      denomination: "lutheran",
    });
  });
});

describe("QA stream contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits an in-band error followed by done when the pipeline fails", async () => {
    mocks.completionCreate.mockRejectedValueOnce(new Error("provider failed"));

    const response = await executeQa({
      question: "What is justification?",
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(response.headers.get("Content-Type")).toContain(
      "application/x-ndjson",
    );
    expect(events).toEqual([
      { type: "progress", message: "Understanding question..." },
      {
        type: "error",
        stage: "categorization",
        message: "We couldn't finish this response.",
      },
      { type: "done" },
    ]);
  });

  it("terminates a refusal stream with done", async () => {
    async function* refusalStream() {
      yield { choices: [{ delta: { content: "I can’t answer that." } }] };
    }

    mocks.completionCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reformatted_question: "A non-biblical request",
                category: "Non-Biblical Questions",
                subcategory: "Other",
                issue_type: "other",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce(refusalStream());
    mocks.questionHistoryCreate.mockResolvedValueOnce({});

    const response = await executeQa({
      question: "A non-biblical request",
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(events.at(-1)).toEqual({ type: "done" });
    expect(events).toContainEqual({
      type: "refusal",
      content: "I can’t answer that.",
    });
  });
});
