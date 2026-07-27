import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  chatStreamEventSchema,
  createChatRequestSchema,
  createChatResponseSchema,
  getChatResponseSchema,
  qaRequestSchema,
  qaStreamEventSchema,
  sendChatMessageRequestSchema,
  stopChatRequestSchema,
  stopChatResponseSchema,
} from "./contracts";
import { buildSpec, serializeSpec } from "./spec";

type TestMediaType = {
  description?: string;
  example?: unknown;
  schema: { $ref?: string };
};

type TestOperation = {
  deprecated?: boolean;
  operationId: string;
  parameters?: Array<{ example?: unknown }>;
  requestBody?: {
    content: Record<string, TestMediaType>;
  };
  responses: Record<
    string,
    {
      content: Record<string, TestMediaType>;
      headers?: Record<
        string,
        { description: string; schema: { example?: unknown } }
      >;
    }
  >;
};

type TestSpec = {
  components: {
    schemas: Record<string, { properties: Record<string, unknown> }>;
  };
  jsonSchemaDialect: string;
  openapi: string;
  paths: Record<
    string,
    {
      get: TestOperation;
      post: TestOperation;
    }
  >;
};

function buildTestSpec() {
  return buildSpec() as unknown as TestSpec;
}

describe("OpenAPI document", () => {
  it("builds deterministic OpenAPI 3.1 from the contract registry", () => {
    const first = serializeSpec();
    const second = serializeSpec();
    const spec = buildTestSpec();

    expect(first).toBe(second);
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.jsonSchemaDialect).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
  });

  it("documents all v1 operations and deprecated legacy shims", () => {
    const paths = buildTestSpec().paths;

    expect(paths["/api/v1/chats"].post.operationId).toBe("createChat");
    expect(paths["/api/v1/chats/{chatId}"].get.operationId).toBe("getChat");
    expect(
      paths["/api/v1/chats/{chatId}/messages"].post.operationId,
    ).toBe("sendChatMessage");
    expect(
      paths["/api/v1/chats/{chatId}/requests/{requestId}/stop"].post
        .operationId,
    ).toBe("stopChatRequest");
    expect(paths["/api/v1/qa"].post.operationId).toBe("askQa");
    expect(paths["/api/parrot-chat"].post.deprecated).toBe(true);
    expect(paths["/api/parrot-chat"].get.deprecated).toBe(true);
    expect(paths["/api/parrot-qa"].post.deprecated).toBe(true);
  });

  it("documents deprecation metadata on every legacy response", () => {
    const paths = buildTestSpec().paths;
    const legacyOperations = [
      paths["/api/parrot-chat"].post,
      paths["/api/parrot-chat"].get,
      paths["/api/parrot-qa"].post,
    ];

    for (const operation of legacyOperations) {
      for (const response of Object.values(operation.responses)) {
        expect(response.headers?.Deprecation.schema.example).toBe(
          "@1785024000",
        );
        expect(response.headers?.Link.schema.example).toContain(
          'rel="deprecation"',
        );
      }
    }
  });

  it("documents NDJSON as one object per line with in-band errors", () => {
    const paths = buildTestSpec().paths;
    const chatMedia =
      paths["/api/v1/chats/{chatId}/messages"].post.responses["200"].content[
        "application/x-ndjson"
      ];
    const qaMedia =
      paths["/api/v1/qa"].post.responses["200"].content[
        "application/x-ndjson"
      ];

    expect(chatMedia.schema.$ref).toBe(
      "#/components/schemas/ChatStreamEvent",
    );
    expect(qaMedia.schema.$ref).toBe("#/components/schemas/QaStreamEvent");
    expect(chatMedia.description).toContain("one complete JSON object");
    expect(chatMedia.description).toContain("in-band");
    expect(qaMedia.description).toContain("one complete JSON object");
    expect(qaMedia.description).toContain("in-band");
  });

  it("documents request conflict behavior and excludes v1 userId", () => {
    const spec = buildTestSpec();
    const createProperties =
      spec.components.schemas.CreateChatRequest.properties;
    const qaProperties = spec.components.schemas.QaRequest.properties;
    const createResponses =
      spec.paths["/api/v1/chats"].post.responses;
    const messageResponses =
      spec.paths["/api/v1/chats/{chatId}/messages"].post.responses;

    expect(createProperties).not.toHaveProperty("userId");
    expect(qaProperties).not.toHaveProperty("userId");
    expect(createResponses).toHaveProperty("409");
    expect(messageResponses).toHaveProperty("409");
  });

  it("provides representative v1 request and successful response examples", () => {
    const paths = buildTestSpec().paths;
    const operations = [
      {
        operation: paths["/api/v1/chats"].post,
        successStatus: "201",
      },
      {
        operation: paths["/api/v1/chats/{chatId}"].get,
        successStatus: "200",
      },
      {
        operation: paths["/api/v1/chats/{chatId}/messages"].post,
        successStatus: "200",
      },
      {
        operation:
          paths["/api/v1/chats/{chatId}/requests/{requestId}/stop"].post,
        successStatus: "200",
      },
      {
        operation: paths["/api/v1/qa"].post,
        successStatus: "200",
      },
    ];

    for (const { operation, successStatus } of operations) {
      for (const media of Object.values(
        operation.requestBody?.content ?? {},
      )) {
        expect(media).toHaveProperty("example");
      }
      for (const parameter of operation.parameters ?? []) {
        expect(parameter).toHaveProperty("example");
      }
      for (const media of Object.values(
        operation.responses[successStatus].content,
      )) {
        expect(media).toHaveProperty("example");
      }
    }
  });

  it("keeps every v1 media example valid against its runtime schema", () => {
    const paths = buildTestSpec().paths;
    const examples: Array<{
      example: unknown;
      schema: { safeParse(value: unknown): { success: boolean } };
    }> = [
      {
        example:
          paths["/api/v1/chats"].post.requestBody?.content[
            "application/json"
          ].example,
        schema: createChatRequestSchema,
      },
      {
        example:
          paths["/api/v1/chats"].post.responses["201"].content[
            "application/json"
          ].example,
        schema: createChatResponseSchema,
      },
      {
        example:
          paths["/api/v1/chats/{chatId}"].get.responses["200"].content[
            "application/json"
          ].example,
        schema: getChatResponseSchema,
      },
      {
        example:
          paths["/api/v1/chats/{chatId}/messages"].post.requestBody?.content[
            "application/json"
          ].example,
        schema: sendChatMessageRequestSchema,
      },
      {
        example:
          paths["/api/v1/chats/{chatId}/messages"].post.responses["200"]
            .content["application/x-ndjson"].example,
        schema: chatStreamEventSchema,
      },
      {
        example:
          paths["/api/v1/chats/{chatId}/requests/{requestId}/stop"].post
            .requestBody?.content["application/json"].example,
        schema: stopChatRequestSchema,
      },
      {
        example:
          paths["/api/v1/chats/{chatId}/requests/{requestId}/stop"].post
            .responses["200"].content["application/json"].example,
        schema: stopChatResponseSchema,
      },
      {
        example:
          paths["/api/v1/qa"].post.requestBody?.content["application/json"]
            .example,
        schema: qaRequestSchema,
      },
      {
        example:
          paths["/api/v1/qa"].post.responses["200"].content[
            "application/x-ndjson"
          ].example,
        schema: qaStreamEventSchema,
      },
    ];

    for (const { example, schema } of examples) {
      expect(schema.safeParse(example).success).toBe(true);
    }
  });

  it("matches the committed generated artifact byte for byte", () => {
    const committed = readFileSync(
      resolve(process.cwd(), "docs/api/openapi.json"),
      "utf8",
    );

    expect(committed).toBe(serializeSpec());
  });
});
