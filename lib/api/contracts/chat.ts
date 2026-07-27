import { z } from "zod";

import {
  denominationSchema,
  errorResponseSchema,
  isoDateTimeSchema,
  requestIdSchema,
  resourceIdSchema,
} from "./common";

const questionSchema = z
  .string()
  .trim()
  .min(1)
  .max(20_000)
  .describe("The initial question or message from the user.");

const answerSchema = z
  .string()
  .trim()
  .min(1)
  .max(100_000)
  .describe("An existing answer used to continue a QA result as a chat.");

const classificationSchema = z
  .string()
  .trim()
  .min(1)
  .max(200);

export const createChatRequestSchema = z
  .strictObject({
    initialQuestion: questionSchema,
    initialAnswer: answerSchema.optional(),
    denomination: denominationSchema.optional(),
    clientChatId: resourceIdSchema.optional(),
    requestId: requestIdSchema.optional(),
    category: classificationSchema.optional(),
    subcategory: classificationSchema.optional(),
    issueType: classificationSchema.optional(),
  })
  .describe(
    "Creates a chat and persists its initial user message. A caller-supplied requestId makes identical retries return the original identifiers.",
  );

export const createChatResponseSchema = z
  .strictObject({
    chatId: resourceIdSchema,
    messageId: resourceIdSchema,
    requestId: requestIdSchema,
  })
  .describe("Identifiers needed to navigate to and continue the new chat.");

export const getChatParamsSchema = z.strictObject({
  chatId: resourceIdSchema,
});

export const chatSenderSchema = z.enum([
  "user",
  "parrot",
  "tool_summary",
  "system_error",
  "system_stopped",
]);

export const chatMessageSchema = z
  .strictObject({
    id: resourceIdSchema,
    chatId: resourceIdSchema,
    requestId: requestIdSchema.nullable(),
    sender: chatSenderSchema,
    content: z.string(),
    timestamp: isoDateTimeSchema,
    toolName: z.string().min(1).optional(),
  })
  .describe("One persisted message in a chat transcript.");

export const chatSchema = z
  .strictObject({
    id: resourceIdSchema,
    conversationName: z.string().min(1),
    createdAt: isoDateTimeSchema,
    modifiedAt: isoDateTimeSchema,
    category: z.string(),
    subcategory: z.string(),
    issueType: z.string(),
    denomination: denominationSchema,
    effectiveDenomination: denominationSchema,
  })
  .describe("Public chat metadata. Internal ownership identifiers are omitted.");

export const getChatResponseSchema = z
  .strictObject({
    chat: chatSchema,
    messages: z.array(chatMessageSchema),
  })
  .describe("A chat and its ordered, normalized transcript.");

export const sendChatMessageRequestSchema = z
  .strictObject({
    message: questionSchema,
    requestId: requestIdSchema.optional(),
    messageId: resourceIdSchema.optional(),
    isAutoTrigger: z.boolean().optional(),
    retry: z.boolean().optional(),
  })
  .describe("Starts or retries one streamed response in an existing chat.");

export const chatStreamEventSchema = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("progress"),
      title: z.string(),
      content: z.string(),
      requestId: requestIdSchema,
    }),
    z.strictObject({
      type: z.literal("tool_progress"),
      toolName: z.string().min(1),
      message: z.string(),
      requestId: requestIdSchema,
    }),
    z.strictObject({
      type: z.literal("tool_summary"),
      toolName: z.string().min(1),
      content: z.string(),
      requestId: requestIdSchema,
    }),
    z.strictObject({
      type: z.literal("parrot"),
      content: z.string(),
      requestId: requestIdSchema,
    }),
    z.strictObject({
      type: z.literal("conversationNameUpdated"),
      chatId: resourceIdSchema,
      name: z.string().min(1),
      requestId: requestIdSchema,
    }),
    z.strictObject({
      type: z.literal("error"),
      stage: z.string().min(1),
      message: z.string().min(1),
      requestId: requestIdSchema,
    }),
    z.strictObject({
      type: z.literal("done"),
      requestId: requestIdSchema,
    }),
  ])
  .describe(
    "One NDJSON line emitted while the LangGraph-backed chat response runs.",
  );

export const stopChatParamsSchema = z.strictObject({
  chatId: resourceIdSchema,
  requestId: requestIdSchema,
});

export const stopChatRequestSchema = z
  .strictObject({})
  .describe(
    "The stop operation has no body fields; chatId and requestId are path parameters.",
  );

export const stopChatResponseSchema = z.union([
  z.strictObject({
    stopped: z.literal(true),
    completed: z.literal(false),
  }),
  z.strictObject({
    stopped: z.literal(false),
    completed: z.literal(true),
  }),
  z.strictObject({
    stopped: z.literal(false),
    completed: z.literal(false),
    failed: z.literal(true),
  }),
]);

export const legacyChatCreateRequestSchema = z
  .strictObject({
    initialQuestion: questionSchema,
    initialAnswer: answerSchema.optional(),
    userId: z
      .string()
      .optional()
      .describe("Deprecated and ignored; identity is resolved from cookies."),
    denomination: denominationSchema.optional(),
    clientChatId: resourceIdSchema.optional(),
    requestId: requestIdSchema.optional(),
    category: classificationSchema.optional(),
    subcategory: classificationSchema.optional(),
    issue_type: classificationSchema.optional(),
  })
  .describe("Deprecated legacy shape for creating a chat.");

export const legacyChatMessageRequestSchema = z
  .strictObject({
    chatId: resourceIdSchema,
    message: questionSchema,
    userId: z
      .string()
      .optional()
      .describe("Deprecated and ignored; identity is resolved from cookies."),
    denomination: denominationSchema.optional(),
    requestId: requestIdSchema.optional(),
    messageId: resourceIdSchema.optional(),
    isAutoTrigger: z.boolean().optional(),
    retry: z.boolean().optional(),
  })
  .describe("Deprecated legacy shape for sending a chat message.");

export const legacyStopChatRequestSchema = z
  .strictObject({
    chatId: resourceIdSchema,
    requestId: requestIdSchema,
    stop: z.literal(true),
  })
  .describe("Deprecated legacy shape for stopping a response.");

export const legacyParrotChatRequestSchema = z.union([
  legacyStopChatRequestSchema,
  legacyChatMessageRequestSchema,
  legacyChatCreateRequestSchema,
]);

export const legacyGetChatQuerySchema = z.strictObject({
  chatId: resourceIdSchema,
});

export const legacyChatMessageSchema = chatMessageSchema.extend({
  sender: z.union([chatSenderSchema, z.literal("calvin")]),
  raw: z.unknown().nullable().optional(),
});

export const legacyGetChatResponseSchema = z
  .strictObject({
    chat: chatSchema
      .omit({ issueType: true })
      .extend({
        issue_type: z.string(),
        userId: resourceIdSchema,
      }),
    messages: z.array(legacyChatMessageSchema),
  })
  .describe("Deprecated legacy chat history shape.");

export {
  errorResponseSchema,
  requestIdSchema,
  resourceIdSchema,
};

export type CreateChatRequest = z.input<typeof createChatRequestSchema>;
export type CreateChatResponse = z.output<typeof createChatResponseSchema>;
export type GetChatResponse = z.output<typeof getChatResponseSchema>;
export type SendChatMessageRequest = z.input<
  typeof sendChatMessageRequestSchema
>;
export type ChatStreamEvent = z.output<typeof chatStreamEventSchema>;
export type StopChatParams = z.input<typeof stopChatParamsSchema>;
export type StopChatRequest = z.input<typeof stopChatRequestSchema>;
export type StopChatResponse = z.output<typeof stopChatResponseSchema>;
export type LegacyChatCreateRequest = z.input<
  typeof legacyChatCreateRequestSchema
>;
export type LegacyChatMessageRequest = z.input<
  typeof legacyChatMessageRequestSchema
>;
export type LegacyStopChatRequest = z.input<
  typeof legacyStopChatRequestSchema
>;
