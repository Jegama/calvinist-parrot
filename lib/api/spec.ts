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
  createSermonEvaluationRequestSchema,
  createSermonEvaluationResponseSchema,
  finalizeSermonUploadRequestSchema,
  finalizeSermonUploadResponseSchema,
  getSermonEvaluationResponseSchema,
  listSermonEvaluationsResponseSchema,
  prepareSermonUploadRequestSchema,
  prepareSermonUploadResponseSchema,
  reevaluateSermonRequestSchema,
  sendChatMessageRequestSchema,
  sermonAnalyticsResponseSchema,
  sermonCapabilitiesResponseSchema,
  sermonDeleteResponseSchema,
  sermonEvaluationStatusResponseSchema,
  sermonMutationResponseSchema,
  sermonPlaybackTokenResponseSchema,
  stopChatRequestSchema,
  stopChatResponseSchema,
  updateSermonDurationPolicyRequestSchema,
  updateSermonDurationPolicyResponseSchema,
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

const sermonEvaluationIdParameter = {
  name: "id",
  in: "path",
  required: true,
  description: "Opaque sermon evaluation identifier.",
  schema: { type: "string", minLength: 1, maxLength: 191 },
} as const;

const sermonErrorResponses = {
  "400": {
    description: "The request did not match the strict contract.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "401": {
    description: "An authenticated Appwrite session is required.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "403": {
    description:
      "The authenticated user does not have the required sermon-evaluator label.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "404": {
    description: "The owner-scoped sermon evaluation was not found.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "409": {
    description:
      "The operation conflicts with current upload, audio, credit, or evaluation state.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "429": {
    description:
      "The daily run limit or lifetime fingerprint credit limit was exceeded.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
  "500": {
    description: "The request failed before completion.",
    content: jsonBody(schemaRef("ErrorResponse")),
  },
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
        name: "Sermon Evaluations",
        description:
          "Private, owner-scoped sermon audio evaluation control plane.",
      },
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
            "Creates a chat and persists the initial message. When `initialAnswer` is supplied, the answer and optional classification fields are also persisted so a QA result can continue as a chat. A caller-supplied `requestId` is scoped to the current browser actor: retrying the same payload returns the original identifiers, while reusing it for a different payload returns 409.",
          requestBody: {
            required: true,
            content: jsonBody(
              schemaRef("CreateChatRequest"),
              createChatRequestExample,
            ),
          },
          responses: {
            "201": {
              description: "Chat created or an identical creation replayed.",
              content: jsonBody(
                schemaRef("CreateChatResponse"),
                createChatResponseExample,
              ),
            },
            "409": {
              description:
                "The request ID conflicts with another chat creation, or the client chat ID is already in use.",
              content: jsonBody(schemaRef("ErrorResponse")),
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
      "/api/v1/sermon-evaluations/uploads/prepare": {
        post: {
          tags: ["Sermon Evaluations"],
          operationId: "prepareSermonUpload",
          summary: "Decide whether sermon audio must be uploaded",
          description:
            "Performs owner-scoped SHA-256 deduplication before minting a short-lived Appwrite upload JWT. Another owner's matching bytes are never revealed.",
          requestBody: {
            required: true,
            content: jsonBody(
              schemaRef("PrepareSermonUploadRequest"),
            ),
          },
          responses: {
            "200": {
              description:
                "Existing evaluation, reattachment, or direct-upload decision.",
              content: jsonBody(
                schemaRef("PrepareSermonUploadResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/uploads/finalize": {
        post: {
          tags: ["Sermon Evaluations"],
          operationId: "finalizeSermonUpload",
          summary: "Finalize a direct Appwrite audio upload",
          description:
            "Verifies the owner-scoped reservation and Appwrite metadata, size, chunk completion, MIME type, and permissions before atomically attaching one canonical asset.",
          requestBody: {
            required: true,
            content: jsonBody(
              schemaRef("FinalizeSermonUploadRequest"),
            ),
          },
          responses: {
            "200": {
              description:
                "Canonical audio is ready or a competing tab already produced the evaluation.",
              content: jsonBody(
                schemaRef("FinalizeSermonUploadResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations": {
        post: {
          tags: ["Sermon Evaluations"],
          operationId: "createSermonEvaluation",
          summary: "Create an asynchronous sermon evaluation",
          description:
            "Atomically creates the durable evaluation and reserves daily and fingerprint-level scoring credits before invoking the private Appwrite worker.",
          requestBody: {
            required: true,
            content: jsonBody(
              schemaRef("CreateSermonEvaluationRequest"),
            ),
          },
          responses: {
            "201": {
              description: "Evaluation queued.",
              content: jsonBody(
                schemaRef("CreateSermonEvaluationResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
        get: {
          tags: ["Sermon Evaluations"],
          operationId: "listSermonEvaluations",
          summary: "List the owner's sermon evaluations",
          parameters: [
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "QUEUED",
                  "PREPARING_AUDIO",
                  "EXTRACTING",
                  "SCORING",
                  "HARMONIZING",
                  "CALIBRATING",
                  "SUMMARIZING",
                  "COMPLETE",
                  "COMPLETE_WITH_WARNINGS",
                  "FAILED",
                  "TIMED_OUT",
                  "CANCELED",
                ],
              },
            },
            {
              name: "preacherId",
              in: "query",
              schema: { type: "string" },
            },
            {
              name: "preachedFrom",
              in: "query",
              schema: { type: "string", format: "date" },
            },
            {
              name: "preachedTo",
              in: "query",
              schema: { type: "string", format: "date" },
            },
            {
              name: "durationAdjusted",
              in: "query",
              schema: { type: "boolean" },
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 100,
                default: 50,
              },
            },
            {
              name: "cursor",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Owner-scoped evaluation page.",
              content: jsonBody(
                schemaRef("ListSermonEvaluationsResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/capabilities": {
        get: {
          tags: ["Sermon Evaluations"],
          operationId: "getSermonEvaluationCapabilities",
          summary: "Get server-derived sermon capabilities",
          responses: {
            "200": {
              description:
                "Capabilities derived from the authenticated Appwrite user's labels.",
              content: jsonBody(
                schemaRef("SermonCapabilitiesResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/analytics": {
        get: {
          tags: ["Sermon Evaluations"],
          operationId: "getSermonEvaluationAnalytics",
          summary: "Get private sermon evaluation analytics",
          responses: {
            "200": {
              description: "Owner-scoped preacher and impact series.",
              content: jsonBody(
                schemaRef("SermonAnalyticsResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}": {
        get: {
          tags: ["Sermon Evaluations"],
          operationId: "getSermonEvaluation",
          summary: "Get a sermon evaluation detail",
          parameters: [sermonEvaluationIdParameter],
          responses: {
            "200": {
              description:
                "Evaluation detail, progress, result, history, and credit balance.",
              content: jsonBody(
                schemaRef("GetSermonEvaluationResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
        delete: {
          tags: ["Sermon Evaluations"],
          operationId: "deleteSermonEvaluation",
          summary: "Delete a sermon evaluation",
          description:
            "Removes the report from the owner's active history without refunding consumed scoring credits.",
          parameters: [sermonEvaluationIdParameter],
          responses: {
            "200": {
              description: "Evaluation deleted.",
              content: jsonBody(schemaRef("SermonDeleteResponse")),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}/status": {
        get: {
          tags: ["Sermon Evaluations"],
          operationId: "getSermonEvaluationStatus",
          summary: "Get stable evaluation progress",
          parameters: [sermonEvaluationIdParameter],
          responses: {
            "200": {
              description:
                "Stage, run progress, retry wave, timestamps, warnings, errors, and credits.",
              content: jsonBody(
                schemaRef("SermonEvaluationStatusResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}/cancel": {
        post: {
          tags: ["Sermon Evaluations"],
          operationId: "cancelSermonEvaluation",
          summary: "Request evaluation cancellation",
          parameters: [sermonEvaluationIdParameter],
          responses: {
            "200": {
              description: "Cancellation state persisted.",
              content: jsonBody(
                schemaRef("SermonMutationResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}/retry": {
        post: {
          tags: ["Sermon Evaluations"],
          operationId: "retrySermonEvaluation",
          summary: "Retry failed or timed-out work",
          description:
            "Queues a fresh attempt on the same evaluation without consuming additional fingerprint credits.",
          parameters: [sermonEvaluationIdParameter],
          responses: {
            "200": {
              description: "Retry queued.",
              content: jsonBody(
                schemaRef("SermonMutationResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}/reevaluate": {
        post: {
          tags: ["Sermon Evaluations"],
          operationId: "reevaluateSermon",
          summary: "Create a new evaluation from retained audio",
          parameters: [sermonEvaluationIdParameter],
          requestBody: {
            required: true,
            content: jsonBody(
              schemaRef("ReevaluateSermonRequest"),
            ),
          },
          responses: {
            "201": {
              description:
                "New evaluation and scoring-credit reservation created.",
              content: jsonBody(
                schemaRef("CreateSermonEvaluationResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}/duration-policy": {
        patch: {
          tags: ["Sermon Evaluations"],
          operationId: "updateSermonDurationPolicy",
          summary: "Toggle the deterministic duration adjustment",
          description:
            "Updates the displayed impact and queues versioned report regeneration without re-running Gemini.",
          parameters: [sermonEvaluationIdParameter],
          requestBody: {
            required: true,
            content: jsonBody(
              schemaRef("UpdateSermonDurationPolicyRequest"),
            ),
          },
          responses: {
            "200": {
              description: "Duration policy updated.",
              content: jsonBody(
                schemaRef("UpdateSermonDurationPolicyResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}/audio/playback-token": {
        post: {
          tags: ["Sermon Evaluations"],
          operationId: "createSermonPlaybackToken",
          summary: "Create a five-minute private audio URL",
          parameters: [sermonEvaluationIdParameter],
          responses: {
            "200": {
              description: "Short-lived tokenized Appwrite view URL.",
              content: jsonBody(
                schemaRef("SermonPlaybackTokenResponse"),
              ),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}/audio": {
        delete: {
          tags: ["Sermon Evaluations"],
          operationId: "deleteSermonAudio",
          summary: "Delete retained audio but keep reports",
          parameters: [sermonEvaluationIdParameter],
          responses: {
            "200": {
              description:
                "Audio deleted; fingerprint credit tombstone retained.",
              content: jsonBody(schemaRef("SermonDeleteResponse")),
            },
            ...sermonErrorResponses,
          },
        },
      },
      "/api/v1/sermon-evaluations/{id}/exports/{format}": {
        get: {
          tags: ["Sermon Evaluations"],
          operationId: "getSermonEvaluationExport",
          summary: "Download a versioned sermon report",
          parameters: [
            sermonEvaluationIdParameter,
            {
              name: "format",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: ["markdown", "json", "csv"],
              },
            },
            {
              name: "version",
              in: "query",
              required: false,
              description:
                "Immutable report version. Omit to download the latest version.",
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            "200": {
              description: "Latest immutable report in the requested format.",
              content: {
                "text/markdown": { schema: { type: "string" } },
                "application/json": { schema: {} },
                "text/csv": { schema: { type: "string" } },
              },
            },
            ...sermonErrorResponses,
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
        PrepareSermonUploadRequest: zodToOpenApiSchema(
          prepareSermonUploadRequestSchema,
          "input",
        ),
        PrepareSermonUploadResponse: zodToOpenApiSchema(
          prepareSermonUploadResponseSchema,
        ),
        FinalizeSermonUploadRequest: zodToOpenApiSchema(
          finalizeSermonUploadRequestSchema,
          "input",
        ),
        FinalizeSermonUploadResponse: zodToOpenApiSchema(
          finalizeSermonUploadResponseSchema,
        ),
        CreateSermonEvaluationRequest: zodToOpenApiSchema(
          createSermonEvaluationRequestSchema,
          "input",
        ),
        CreateSermonEvaluationResponse: zodToOpenApiSchema(
          createSermonEvaluationResponseSchema,
        ),
        ListSermonEvaluationsResponse: zodToOpenApiSchema(
          listSermonEvaluationsResponseSchema,
        ),
        SermonCapabilitiesResponse: zodToOpenApiSchema(
          sermonCapabilitiesResponseSchema,
        ),
        GetSermonEvaluationResponse: zodToOpenApiSchema(
          getSermonEvaluationResponseSchema,
        ),
        SermonEvaluationStatusResponse: zodToOpenApiSchema(
          sermonEvaluationStatusResponseSchema,
        ),
        SermonAnalyticsResponse: zodToOpenApiSchema(
          sermonAnalyticsResponseSchema,
        ),
        SermonMutationResponse: zodToOpenApiSchema(
          sermonMutationResponseSchema,
        ),
        ReevaluateSermonRequest: zodToOpenApiSchema(
          reevaluateSermonRequestSchema,
          "input",
        ),
        UpdateSermonDurationPolicyRequest: zodToOpenApiSchema(
          updateSermonDurationPolicyRequestSchema,
          "input",
        ),
        UpdateSermonDurationPolicyResponse: zodToOpenApiSchema(
          updateSermonDurationPolicyResponseSchema,
        ),
        SermonPlaybackTokenResponse: zodToOpenApiSchema(
          sermonPlaybackTokenResponseSchema,
        ),
        SermonDeleteResponse: zodToOpenApiSchema(
          sermonDeleteResponseSchema,
        ),
      },
    },
  };
}

export function serializeSpec(spec: OpenApiDocument = buildSpec()) {
  return `${JSON.stringify(spec, null, 2)}\n`;
}
