import {
  chatMessageSchema,
  chatSchema,
  chatStreamEventSchema,
  createChatRequestSchema,
  createChatResponseSchema,
  errorResponseSchema,
  getChatResponseSchema,
  legacyGetChatResponseSchema,
  legacyParrotChatRequestSchema,
  legacyQaRequestSchema,
  qaRequestSchema,
  qaStreamEventSchema,
  sendChatMessageRequestSchema,
  stopChatRequestSchema,
  stopChatResponseSchema,
} from "./contracts";
import {
  jsonBody,
  ndjsonBody,
  schemaRef,
  type OpenApiDocument,
  zodToOpenApiSchema,
} from "./openapi";

const chatStreamDescription =
  "Newline-delimited JSON. Each line is one complete JSON object matching ChatStreamEvent. Once streaming begins, runtime failures are reported in-band as `error` events because the HTTP status has already been sent.";

const qaStreamDescription =
  "Newline-delimited JSON. Each line is one complete JSON object matching QaStreamEvent. Once streaming begins, runtime failures are reported in-band as `error` events because the HTTP status has already been sent.";

const exampleIds = {
  chatId: "cm5h7x9k20000v8b4r3m2n1q0",
  messageId: "8b90be0d-497f-48cb-8c67-85c2e28f2e83",
  requestId: "f6bb8ec0-6d64-4c30-9f15-3eeebc61ff48",
} as const;

const createChatRequestExample = {
  initialQuestion: "What does justification by faith mean?",
  denomination: "reformed-baptist",
  clientChatId: exampleIds.chatId,
  requestId: exampleIds.requestId,
};

const createChatResponseExample = {
  chatId: exampleIds.chatId,
  messageId: exampleIds.messageId,
  requestId: exampleIds.requestId,
};

const getChatResponseExample = {
  chat: {
    id: exampleIds.chatId,
    conversationName: "Justification by Faith",
    createdAt: "2026-07-26T14:30:00.000Z",
    modifiedAt: "2026-07-26T14:30:08.000Z",
    category: "Theology",
    subcategory: "Soteriology",
    issueType: "Primary",
    denomination: "reformed-baptist",
    effectiveDenomination: "reformed-baptist",
  },
  messages: [
    {
      id: exampleIds.messageId,
      chatId: exampleIds.chatId,
      requestId: exampleIds.requestId,
      sender: "user",
      content: "What does justification by faith mean?",
      timestamp: "2026-07-26T14:30:00.000Z",
    },
    {
      id: "cm5h7x9k20001v8b4w6d5c4b3",
      chatId: exampleIds.chatId,
      requestId: exampleIds.requestId,
      sender: "parrot",
      content:
        "Justification is God's gracious declaration that a sinner is righteous through faith in Jesus Christ.",
      timestamp: "2026-07-26T14:30:08.000Z",
    },
  ],
};

const sendChatMessageRequestExample = {
  message: "How does Romans 3 explain this?",
  requestId: "fa2d8424-b097-491d-b67c-1457a4986ee4",
  messageId: "b60fc8bf-7c35-4e91-af98-b97610923676",
  isAutoTrigger: false,
  retry: false,
};

const chatStreamEventExample = {
  type: "parrot",
  content: "Romans 3 teaches that sinners are justified by grace",
  requestId: sendChatMessageRequestExample.requestId,
};

const stopChatResponseExample = {
  stopped: true,
  completed: false,
};

const qaRequestExample = {
  question: "What is the doctrine of the Trinity?",
  denomination: "reformed-baptist",
};

const qaStreamEventExample = {
  type: "reviewed_answer",
  content:
    "The Bible teaches that the one true God eternally exists as Father, Son, and Holy Spirit.",
};

const errorResponses = {
  "400": {
    description: "The request did not match the contract.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "403": {
    description: "The current browser actor does not own this chat.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "404": {
    description: "The requested chat or request was not found.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "500": {
    description: "The request failed before a stream could begin.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
} as const;

const legacyResponseHeaders = {
  Deprecation: {
    description:
      "RFC 9745 date indicating when this compatibility endpoint was deprecated.",
    schema: { type: "string", example: "@1785024000" },
  },
  Link: {
    description:
      "Migration documentation identified by the deprecation link relation.",
    schema: {
      type: "string",
      example: '</api/v1/docs>; rel="deprecation"; type="text/html"',
    },
  },
} as const;

function withLegacyResponseHeaders<
  T extends Record<string, Record<string, unknown>>,
>(responses: T) {
  return Object.fromEntries(
    Object.entries(responses).map(([status, response]) => [
      status,
      { ...response, headers: legacyResponseHeaders },
    ]),
  );
}

const chatIdParameter = {
  name: "chatId",
  in: "path",
  required: true,
  description: "Opaque chat identifier.",
  schema: { type: "string", minLength: 1, maxLength: 191 },
  example: exampleIds.chatId,
} as const;

const requestIdParameter = {
  name: "requestId",
  in: "path",
  required: true,
  description: "Idempotency identifier for the user request to stop.",
  schema: { type: "string", minLength: 1, maxLength: 191 },
  example: exampleIds.requestId,
} as const;

export function buildSpec(): OpenApiDocument {
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "Calvinist Parrot Conversational API",
      version: "1.0.0",
      description:
        "Versioned contracts for Calvinist Parrot chat and Counsel of Three QA. Browser identity is always resolved server-side from the Appwrite session or server-managed guest cookie; v1 clients must not send `userId`.",
    },
    servers: [{ url: "/", description: "Current Calvinist Parrot origin" }],
    tags: [
      { name: "Chat", description: "LangGraph-backed conversations." },
      { name: "QA", description: "Counsel of Three question answering." },
      {
        name: "Legacy",
        description:
          "Compatibility routes retained temporarily while clients migrate to v1.",
      },
    ],
    paths: {
      "/api/v1/chats": {
        post: {
          tags: ["Chat"],
          operationId: "createChat",
          summary: "Create a chat",
          description:
            "Creates a chat and persists the initial message. When `initialAnswer` is supplied, the answer and optional classification fields are also persisted so a QA result can continue as a chat.",
          requestBody: {
            required: true,
            content: jsonBody(
              schemaRef("CreateChatRequest"),
              createChatRequestExample,
            ),
          },
          responses: {
            "201": {
              description: "Chat created.",
              content: jsonBody(
                schemaRef("CreateChatResponse"),
                createChatResponseExample,
              ),
            },
            ...errorResponses,
          },
        },
      },
      "/api/v1/chats/{chatId}": {
        get: {
          tags: ["Chat"],
          operationId: "getChat",
          summary: "Get a chat transcript",
          description:
            "Returns public chat metadata and normalized messages without exposing the internal ownership identifier.",
          parameters: [chatIdParameter],
          responses: {
            "200": {
              description: "Chat and ordered transcript.",
              content: jsonBody(
                schemaRef("GetChatResponse"),
                getChatResponseExample,
              ),
            },
            ...errorResponses,
          },
        },
      },
      "/api/v1/chats/{chatId}/messages": {
        post: {
          tags: ["Chat"],
          operationId: "sendChatMessage",
          summary: "Stream a chat response",
          description:
            "Starts a LangGraph response. Reusing a request ID with a different message, or retrying a request that already completed, returns 409 before streaming begins.",
          parameters: [chatIdParameter],
          requestBody: {
            required: true,
            content: jsonBody(
              schemaRef("SendChatMessageRequest"),
              sendChatMessageRequestExample,
            ),
          },
          responses: {
            "200": {
              description: "The response stream started.",
              content: ndjsonBody(
                schemaRef("ChatStreamEvent"),
                chatStreamDescription,
                chatStreamEventExample,
              ),
            },
            "409": {
              description:
                "The request ID conflicts with an existing message or completed response.",
              content: jsonBody(schemaRef("ErrorResponse")),
            },
            ...errorResponses,
          },
        },
      },
      "/api/v1/chats/{chatId}/requests/{requestId}/stop": {
        post: {
          tags: ["Chat"],
          operationId: "stopChatRequest",
          summary: "Stop an active response",
          description:
            "Persists a terminal stop for a request. Completion, failure, and stop are idempotent terminal states.",
          parameters: [chatIdParameter, requestIdParameter],
          requestBody: {
            required: false,
            content: jsonBody(schemaRef("StopChatRequest"), {}),
          },
          responses: {
            "200": {
              description: "Current terminal state for the request.",
              content: jsonBody(
                schemaRef("StopChatResponse"),
                stopChatResponseExample,
              ),
            },
            ...errorResponses,
          },
        },
      },
      "/api/v1/qa": {
        post: {
          tags: ["QA"],
          operationId: "askQa",
          summary: "Stream a Counsel of Three answer",
          requestBody: {
            required: true,
            content: jsonBody(schemaRef("QaRequest"), qaRequestExample),
          },
          responses: {
            "200": {
              description: "The QA stream started.",
              content: ndjsonBody(
                schemaRef("QaStreamEvent"),
                qaStreamDescription,
                qaStreamEventExample,
              ),
            },
            ...errorResponses,
          },
        },
      },
      "/api/parrot-chat": {
        post: {
          tags: ["Legacy"],
          operationId: "legacyParrotChatPost",
          summary: "Legacy combined chat operation",
          deprecated: true,
          description:
            "Deprecated compatibility shim. Migrate to the operation-specific v1 chat routes.",
          requestBody: {
            required: true,
            content: jsonBody(schemaRef("LegacyParrotChatRequest")),
          },
          responses: withLegacyResponseHeaders({
            "200": {
              description:
                "Legacy create/stop JSON response or message NDJSON stream, depending on the request shape.",
              content: {
                ...jsonBody({
                  oneOf: [
                    schemaRef("CreateChatResponse"),
                    schemaRef("StopChatResponse"),
                  ],
                }),
                ...ndjsonBody(
                  schemaRef("ChatStreamEvent"),
                  chatStreamDescription,
                ),
              },
            },
            "409": {
              description: "Legacy request ID conflict.",
              content: jsonBody(schemaRef("ErrorResponse")),
            },
            ...errorResponses,
          }),
        },
        get: {
          tags: ["Legacy"],
          operationId: "legacyParrotChatGet",
          summary: "Legacy chat history",
          deprecated: true,
          parameters: [
            {
              name: "chatId",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 191 },
            },
          ],
          responses: withLegacyResponseHeaders({
            "200": {
              description: "Legacy chat history response.",
              content: jsonBody(schemaRef("LegacyGetChatResponse")),
            },
            ...errorResponses,
          }),
        },
      },
      "/api/parrot-qa": {
        post: {
          tags: ["Legacy"],
          operationId: "legacyParrotQa",
          summary: "Legacy Counsel of Three stream",
          deprecated: true,
          description:
            "Deprecated compatibility shim. Migrate to `POST /api/v1/qa`.",
          requestBody: {
            required: true,
            content: jsonBody(schemaRef("LegacyQaRequest")),
          },
          responses: withLegacyResponseHeaders({
            "200": {
              description:
                "Legacy NDJSON payload served with its historical text media type.",
              content: {
                "text/plain": {
                  schema: schemaRef("QaStreamEvent"),
                  description: qaStreamDescription,
                },
              },
            },
            ...errorResponses,
          }),
        },
      },
    },
    components: {
      schemas: {
        ErrorResponse: zodToOpenApiSchema(errorResponseSchema),
        CreateChatRequest: zodToOpenApiSchema(
          createChatRequestSchema,
          "input",
        ),
        CreateChatResponse: zodToOpenApiSchema(createChatResponseSchema),
        Chat: zodToOpenApiSchema(chatSchema),
        ChatMessage: zodToOpenApiSchema(chatMessageSchema),
        GetChatResponse: zodToOpenApiSchema(getChatResponseSchema),
        SendChatMessageRequest: zodToOpenApiSchema(
          sendChatMessageRequestSchema,
          "input",
        ),
        ChatStreamEvent: zodToOpenApiSchema(chatStreamEventSchema),
        StopChatRequest: zodToOpenApiSchema(stopChatRequestSchema, "input"),
        StopChatResponse: zodToOpenApiSchema(stopChatResponseSchema),
        QaRequest: zodToOpenApiSchema(qaRequestSchema, "input"),
        QaStreamEvent: zodToOpenApiSchema(qaStreamEventSchema),
        LegacyParrotChatRequest: zodToOpenApiSchema(
          legacyParrotChatRequestSchema,
          "input",
        ),
        LegacyGetChatResponse: zodToOpenApiSchema(
          legacyGetChatResponseSchema,
        ),
        LegacyQaRequest: zodToOpenApiSchema(legacyQaRequestSchema, "input"),
      },
    },
  };
}

export function serializeSpec(spec: OpenApiDocument = buildSpec()) {
  return `${JSON.stringify(spec, null, 2)}\n`;
}
