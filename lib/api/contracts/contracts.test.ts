import { describe, expect, it } from "vitest";

import {
  chatStreamEventSchema,
  createChatRequestSchema,
  createChatResponseSchema,
  getChatResponseSchema,
  legacyGetChatResponseSchema,
  legacyQaRequestSchema,
  qaRequestSchema,
  qaStreamEventSchema,
  sendChatMessageRequestSchema,
  stopChatRequestSchema,
  stopChatResponseSchema,
} from ".";

describe("v1 API contracts", () => {
  it("accepts the corrected chat creation fields and rejects caller identity", () => {
    expect(
      createChatRequestSchema.safeParse({
        initialQuestion: "What is justification?",
        initialAnswer: "God declares sinners righteous through faith in Christ.",
        denomination: "reformed-baptist",
        clientChatId: "chat-1",
        requestId: "request-1",
        category: "Theology",
        subcategory: "Soteriology",
        issueType: "Primary",
      }).success,
    ).toBe(true);

    expect(
      createChatRequestSchema.safeParse({
        initialQuestion: "What is justification?",
        userId: "caller-controlled",
      }).success,
    ).toBe(false);
  });

  it("requires every chat creation response identifier", () => {
    expect(
      createChatResponseSchema.safeParse({
        chatId: "chat-1",
        messageId: "message-1",
        requestId: "request-1",
      }).success,
    ).toBe(true);
    expect(
      createChatResponseSchema.safeParse({
        chatId: "chat-1",
        requestId: "request-1",
      }).success,
    ).toBe(false);
  });

  it("supports idempotent message fields without accepting route or identity fields", () => {
    expect(
      sendChatMessageRequestSchema.safeParse({
        message: "Please explain Romans 3.",
        requestId: "request-1",
        messageId: "message-1",
        isAutoTrigger: true,
        retry: false,
      }).success,
    ).toBe(true);
    expect(
      sendChatMessageRequestSchema.safeParse({
        chatId: "chat-1",
        message: "Please explain Romans 3.",
      }).success,
    ).toBe(false);
  });

  it("uses an empty stop body and models all terminal outcomes", () => {
    expect(stopChatRequestSchema.safeParse({}).success).toBe(true);
    expect(stopChatRequestSchema.safeParse({ stop: true }).success).toBe(false);

    for (const response of [
      { stopped: true, completed: false },
      { stopped: false, completed: true },
      { stopped: false, completed: false, failed: true },
    ]) {
      expect(stopChatResponseSchema.safeParse(response).success).toBe(true);
    }
  });

  it("does not expose the internal owner in chat history", () => {
    const publicResponse = {
      chat: {
        id: "chat-1",
        conversationName: "Justification",
        createdAt: "2026-07-26T12:00:00.000Z",
        modifiedAt: "2026-07-26T12:00:00.000Z",
        category: "Theology",
        subcategory: "Soteriology",
        issueType: "Primary",
        denomination: "reformed-baptist",
        effectiveDenomination: "reformed-baptist",
      },
      messages: [
        {
          id: "message-1",
          chatId: "chat-1",
          requestId: "request-1",
          sender: "user",
          content: "What is justification?",
          timestamp: "2026-07-26T12:00:00.000Z",
        },
      ],
    };

    expect(getChatResponseSchema.safeParse(publicResponse).success).toBe(true);
    expect(
      getChatResponseSchema.safeParse({
        ...publicResponse,
        chat: { ...publicResponse.chat, userId: "internal-owner" },
      }).success,
    ).toBe(false);
  });

  it("preserves legacy history ownership and stored-row compatibility", () => {
    expect(
      legacyGetChatResponseSchema.safeParse({
        chat: {
          id: "chat-1",
          userId: "legacy-owner",
          conversationName: "Legacy chat",
          createdAt: "2026-07-26T12:00:00.000Z",
          modifiedAt: "2026-07-26T12:00:00.000Z",
          category: "",
          subcategory: "",
          issue_type: "",
          denomination: "reformed-baptist",
          effectiveDenomination: "reformed-baptist",
        },
        messages: [
          {
            id: "message-1",
            chatId: "chat-1",
            requestId: null,
            sender: "calvin",
            content: "Legacy review",
            timestamp: "2026-07-26T12:00:00.000Z",
          },
          {
            id: "message-2",
            chatId: "chat-1",
            requestId: null,
            sender: "tool_summary",
            content: "Legacy source",
            timestamp: "2026-07-26T12:00:01.000Z",
            toolName: "Theological Research",
            raw: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("keeps the live chat event union limited to emitted v1 variants", () => {
    const events = [
      {
        type: "progress",
        title: "Processing",
        content: "Preparing your response...",
        requestId: "request-1",
      },
      {
        type: "tool_progress",
        toolName: "Bible Commentary",
        message: "Searching...",
        requestId: "request-1",
      },
      {
        type: "tool_summary",
        toolName: "Bible Commentary",
        content: "A summary",
        requestId: "request-1",
      },
      { type: "parrot", content: "Grace", requestId: "request-1" },
      {
        type: "conversationNameUpdated",
        chatId: "chat-1",
        name: "Grace",
        requestId: "request-1",
      },
      {
        type: "error",
        stage: "model",
        message: "Unable to continue",
        requestId: "request-1",
      },
      { type: "done", requestId: "request-1" },
    ];

    for (const event of events) {
      expect(chatStreamEventSchema.safeParse(event).success).toBe(true);
    }
    for (const removedType of [
      "info",
      "stopped",
      "calvin",
      "gotQuestions",
      "CCEL",
    ]) {
      expect(
        chatStreamEventSchema.safeParse({
          type: removedType,
          requestId: "request-1",
        }).success,
      ).toBe(false);
    }
    expect(
      chatStreamEventSchema.safeParse({
        type: "done",
      }).success,
    ).toBe(false);
  });

  it("keeps caller identity out of v1 QA while preserving the legacy shim", () => {
    expect(
      qaRequestSchema.safeParse({
        question: "What is the Trinity?",
        userId: "caller-controlled",
      }).success,
    ).toBe(false);
    expect(
      legacyQaRequestSchema.safeParse({
        question: "What is the Trinity?",
        userId: "legacy-external-id",
      }).success,
    ).toBe(true);
  });

  it("includes refusal, in-band error, and done QA events", () => {
    for (const event of [
      { type: "refusal", content: "Please ask a Bible-related question." },
      { type: "error", stage: "categorization", message: "Unable to continue" },
      { type: "done" },
    ]) {
      expect(qaStreamEventSchema.safeParse(event).success).toBe(true);
    }
  });
});
