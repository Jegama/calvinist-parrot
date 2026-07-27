import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getChatResponseSchema,
  legacyGetChatResponseSchema,
} from "@/lib/api/contracts";

const mocks = vi.hoisted(() => ({
  resolveChatActor: vi.fn(),
  getChatActorId: vi.fn(),
  generateConversationName: vi.fn(),
  chatHistoryFindFirst: vi.fn(),
  chatHistoryFindUnique: vi.fn(),
  userProfileFindUnique: vi.fn(),
  chatMessageFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    chatHistory: {
      findFirst: mocks.chatHistoryFindFirst,
      findUnique: mocks.chatHistoryFindUnique,
    },
    userProfile: {
      findUnique: mocks.userProfileFindUnique,
    },
    chatMessage: {
      findMany: mocks.chatMessageFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/guest", () => ({
  resolveChatActor: mocks.resolveChatActor,
  getChatActorId: mocks.getChatActorId,
}));

vi.mock("@/utils/generateConversationName", () => ({
  generateConversationName: mocks.generateConversationName,
}));

vi.mock("@/utils/langChainAgents/mainAgent", () => ({
  getParrotWorkflow: vi.fn(),
}));

vi.mock("@/utils/langChainAgents/tools", () => ({
  toolsArray: [],
}));

vi.mock("@/utils/memoryExtraction", () => ({
  updateUserMemoriesFromConversation: vi.fn(),
}));

vi.mock("@/utils/buildParrotSystemPrompt", () => ({
  buildParrotSystemPrompt: vi.fn(),
}));

import {
  executeChatCommand,
  executeGetChat,
  handleCreateChat,
  handleGetChat,
  handleLegacyChatGet,
  handleLegacyChatPost,
  handleSendChatMessage,
  handleStopChatRequest,
  type ChatCommand,
} from "./chat";

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("chat API adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatActor.mockResolvedValue({
      kind: "authenticated",
      userId: "owner-1",
    });
    mocks.getChatActorId.mockReturnValue("owner-1");
  });

  it("maps the legacy issue_type field and marks the response deprecated", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const execute = vi.fn(
      async (...[, command]: [Request, ChatCommand]) =>
        Response.json(command),
    );

    const response = await handleLegacyChatPost(
      jsonRequest({
        initialQuestion: "What is grace?",
        initialAnswer: "God's unmerited favor.",
        clientChatId: "client-chat-1",
        requestId: "request-1",
        denomination: "presbyterian",
        category: "Doctrine",
        subcategory: "Grace",
        issue_type: "secondary",
        userId: "ignored-caller",
      }),
      execute,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBe("@1785024000");
    expect(response.headers.get("Link")).toBe(
      '</api/v1/docs>; rel="deprecation"; type="text/html"',
    );
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: "deprecated_api_request",
      route: "/api/parrot-chat",
      method: "POST",
      replacement: "/api/v1/chats",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        initialQuestion: "What is grace?",
        initialAnswer: "God's unmerited favor.",
        clientChatId: "client-chat-1",
        requestId: "request-1",
        denomination: "presbyterian",
        category: "Doctrine",
        subcategory: "Grace",
        issueType: "secondary",
      }),
    );
    expect(execute.mock.calls[0][1]).not.toHaveProperty("userId");

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    execute.mockRejectedValueOnce(new Error("legacy executor failed"));
    const failed = await handleLegacyChatPost(
      jsonRequest({ message: "Please explain.", chatId: "chat-1" }),
      execute,
    );
    expect(failed.status).toBe(500);
    expect(failed.headers.get("Deprecation")).toBe("@1785024000");
    expect(error).toHaveBeenCalledWith(
      "Legacy API request failed before streaming began",
      expect.any(Error),
    );
  });

  it("rejects invalid v1 create input and returns 201 for a valid create", async () => {
    const execute = vi.fn(async () =>
      Response.json({
        chatId: "chat-1",
        messageId: "message-1",
        requestId: "request-1",
      }),
    );

    const invalid = await handleCreateChat(
      jsonRequest({
        initialQuestion: "What is grace?",
        userId: "caller-controlled",
      }),
      execute,
    );
    expect(invalid.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();

    const valid = await handleCreateChat(
      jsonRequest({
        initialQuestion: "What is grace?",
        issueType: "secondary",
      }),
      execute,
    );
    expect(valid.status).toBe(201);
    expect(await valid.json()).toEqual({
      chatId: "chat-1",
      messageId: "message-1",
      requestId: "request-1",
    });

    execute.mockResolvedValueOnce(Response.json({ chatId: "chat-1" }));
    const invalidResponse = await handleCreateChat(
      jsonRequest({ initialQuestion: "What is grace?" }),
      execute,
    );
    expect(invalidResponse.status).toBe(500);

    execute.mockRejectedValueOnce(new Error("database unavailable"));
    const failed = await handleCreateChat(
      jsonRequest({ initialQuestion: "What is grace?" }),
      execute,
    );
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Internal server error" });
  });

  it("keeps the message stream media type and maps the path chat ID", async () => {
    const execute = vi.fn(
      async (...[, command]: [Request, ChatCommand]) => {
        void command;
        return new Response('{"type":"done","requestId":"request-1"}\n', {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
          },
        });
      },
    );

    const response = await handleSendChatMessage(
      jsonRequest({
        message: "Please explain.",
        requestId: "request-1",
        retry: true,
      }),
      "chat-1",
      execute,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/x-ndjson",
    );
    expect(execute).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        chatId: "chat-1",
        message: "Please explain.",
        requestId: "request-1",
        retry: true,
      }),
    );
  });

  it("accepts an omitted stop body and rejects unexpected stop fields", async () => {
    const execute = vi.fn(async () =>
      Response.json({ stopped: true, completed: false }),
    );
    const emptyRequest = new Request("http://localhost/api", {
      method: "POST",
    });

    const stopped = await handleStopChatRequest(
      emptyRequest,
      "chat-1",
      "request-1",
      execute,
    );
    expect(stopped.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.any(Request),
      {
        chatId: "chat-1",
        requestId: "request-1",
        stop: true,
      },
    );

    const invalid = await handleStopChatRequest(
      jsonRequest({ stop: true }),
      "chat-1",
      "request-1",
      execute,
    );
    expect(invalid.status).toBe(400);
    expect(execute).toHaveBeenCalledTimes(1);

    execute.mockResolvedValueOnce(
      Response.json({ stopped: true, completed: true }),
    );
    const invalidResponse = await handleStopChatRequest(
      new Request("http://localhost/api", { method: "POST" }),
      "chat-1",
      "request-1",
      execute,
    );
    expect(invalidResponse.status).toBe(500);
  });

  it("validates history IDs before dispatching and deprecates the legacy GET", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const execute = vi.fn(async () =>
      Response.json({ chat: {}, messages: [] }),
    );

    const invalid = await handleGetChat("", execute);
    expect(invalid.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();

    const legacy = await handleLegacyChatGet(
      new Request("http://localhost/api/parrot-chat?chatId=chat-1"),
      execute,
    );
    expect(legacy.headers.get("Deprecation")).toBe("@1785024000");
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: "deprecated_api_request",
      route: "/api/parrot-chat",
      method: "GET",
    });
    expect(execute).toHaveBeenCalledWith("chat-1", { legacyShape: true });
  });
});

describe("chat runtime mappings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatActor.mockResolvedValue({
      kind: "authenticated",
      userId: "owner-1",
    });
    mocks.getChatActorId.mockReturnValue("owner-1");
    mocks.generateConversationName.mockResolvedValue("Grace");
    mocks.chatHistoryFindFirst.mockResolvedValue(null);
    mocks.chatHistoryFindUnique.mockResolvedValue(null);
  });

  it.each([
    { initialAnswer: undefined, expectedName: "New Conversation" },
    { initialAnswer: "God's unmerited favor.", expectedName: "Grace" },
  ])(
    "honors client metadata with initialAnswer=$initialAnswer",
    async ({ initialAnswer, expectedName }) => {
      const chatHistoryCreate = vi.fn(async ({ data }) => ({
        ...data,
        id: data.id ?? "chat-generated",
      }));
      const chatMessageCreate = vi
        .fn()
        .mockResolvedValueOnce({ id: "message-1" })
        .mockResolvedValueOnce({ id: "message-2" });
      mocks.transaction.mockImplementation(async (operation) =>
        operation({
          $executeRaw: vi.fn(),
          chatHistory: {
            findFirst: mocks.chatHistoryFindFirst,
            findUnique: mocks.chatHistoryFindUnique,
            create: chatHistoryCreate,
          },
          chatMessage: { create: chatMessageCreate },
        }),
      );

      const response = await executeChatCommand(
        jsonRequest({}),
        {
          initialQuestion: "What is grace?",
          initialAnswer,
          clientChatId: "client-chat-1",
          requestId: "request-1",
          denomination: "presbyterian",
          category: "Doctrine",
          subcategory: "Grace",
          issueType: "secondary",
        },
      );

      expect(response.status).toBe(200);
      expect(chatHistoryCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "client-chat-1",
          userId: "owner-1",
          creationRequestId: "request-1",
          conversationName: expectedName,
          denomination: "presbyterian",
          category: "Doctrine",
          subcategory: "Grace",
          issue_type: "secondary",
        }),
      });
      expect(await response.json()).toEqual({
        chatId: "client-chat-1",
        messageId: "message-1",
        requestId: "request-1",
      });
    },
  );

  it("replays an identical chat creation and rejects a changed payload", async () => {
    const chatHistoryCreate = vi.fn();
    const chatMessageCreate = vi.fn();
    const existingCreation = {
      id: "chat-1",
      category: "Doctrine",
      subcategory: "Grace",
      issue_type: "secondary",
      denomination: "presbyterian",
      messages: [
        {
          id: "message-1",
          sender: "user",
          content: "What is grace?",
        },
        {
          id: "message-2",
          sender: "parrot",
          content: "God's unmerited favor.",
        },
      ],
    };
    mocks.chatHistoryFindFirst.mockResolvedValue(existingCreation);
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        $executeRaw: vi.fn(),
        chatHistory: {
          findFirst: mocks.chatHistoryFindFirst,
          findUnique: mocks.chatHistoryFindUnique,
          create: chatHistoryCreate,
        },
        chatMessage: { create: chatMessageCreate },
      }),
    );

    const command = {
      initialQuestion: "What is grace?",
      initialAnswer: "God's unmerited favor.",
      requestId: "request-1",
      denomination: "presbyterian",
      category: "Doctrine",
      subcategory: "Grace",
      issueType: "secondary",
    };
    const replayed = await executeChatCommand(jsonRequest({}), command);

    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual({
      chatId: "chat-1",
      messageId: "message-1",
      requestId: "request-1",
    });
    expect(chatHistoryCreate).not.toHaveBeenCalled();
    expect(chatMessageCreate).not.toHaveBeenCalled();

    const conflict = await executeChatCommand(jsonRequest({}), {
      ...command,
      initialQuestion: "What is mercy?",
    });

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: "Request ID conflicts with an existing chat creation",
    });
    expect(chatHistoryCreate).not.toHaveBeenCalled();
  });

  it("returns 409 when a new request reuses an existing client chat ID", async () => {
    const chatHistoryCreate = vi.fn();
    mocks.chatHistoryFindFirst.mockResolvedValue(null);
    mocks.chatHistoryFindUnique.mockResolvedValue({ id: "client-chat-1" });
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        $executeRaw: vi.fn(),
        chatHistory: {
          findFirst: mocks.chatHistoryFindFirst,
          findUnique: mocks.chatHistoryFindUnique,
          create: chatHistoryCreate,
        },
        chatMessage: { create: vi.fn() },
      }),
    );

    const response = await executeChatCommand(jsonRequest({}), {
      initialQuestion: "What is grace?",
      clientChatId: "client-chat-1",
      requestId: "request-2",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Client chat ID is already in use",
    });
    expect(chatHistoryCreate).not.toHaveBeenCalled();
  });

  it("omits ownership and normalizes legacy stored senders in v1 history", async () => {
    const timestamp = new Date("2026-07-26T12:00:00.000Z");
    mocks.chatHistoryFindUnique.mockResolvedValue({
      id: "chat-1",
      userId: "owner-1",
      conversationName: "Grace",
      createdAt: timestamp,
      modifiedAt: timestamp,
      category: "Doctrine",
      subcategory: "Grace",
      issue_type: "secondary",
      denomination: "presbyterian",
    });
    mocks.userProfileFindUnique.mockResolvedValue({
      denomination: "presbyterian",
    });
    mocks.chatMessageFindMany.mockResolvedValue([
      {
        id: "message-1",
        chatId: "chat-1",
        requestId: "request-1",
        sender: "gotQuestions",
        content: "A source",
        timestamp,
      },
      {
        id: "message-2",
        chatId: "chat-1",
        requestId: "request-1",
        sender: "calvin",
        content: "An older answer",
        timestamp,
      },
    ]);

    const response = await executeGetChat("chat-1");
    const body = await response.json();

    expect(body.chat).not.toHaveProperty("userId");
    expect(body.chat).toMatchObject({
      issueType: "secondary",
      denomination: "presbyterian",
      effectiveDenomination: "presbyterian",
    });
    expect(body.messages).toEqual([
      expect.objectContaining({
        sender: "tool_summary",
        toolName: "Theological Research",
      }),
      expect.objectContaining({ sender: "parrot" }),
    ]);
    expect(getChatResponseSchema.parse(body)).toEqual(body);

    const legacyResponse = await executeGetChat("chat-1", {
      legacyShape: true,
    });
    const legacyBody = await legacyResponse.json();
    expect(legacyBody.chat).toMatchObject({
      userId: "owner-1",
      issue_type: "secondary",
    });
    expect(legacyBody.chat).not.toHaveProperty("issueType");
    expect(legacyBody.messages).toEqual([
      expect.objectContaining({
        sender: "tool_summary",
        toolName: "Theological Research",
        raw: null,
      }),
      expect.objectContaining({ sender: "calvin" }),
    ]);
    expect(legacyGetChatResponseSchema.parse(legacyBody)).toEqual(legacyBody);
  });
});
