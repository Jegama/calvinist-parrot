import { z } from "zod";

import { denominationSchema } from "./common";

const qaQuestionSchema = z
  .string()
  .trim()
  .min(1)
  .max(20_000)
  .describe("A Bible or theology question for the Counsel of Three pipeline.");

export const qaRequestSchema = z
  .strictObject({
    question: qaQuestionSchema,
    denomination: denominationSchema.optional(),
  })
  .describe("Starts a streamed Counsel of Three response.");

export const legacyQaRequestSchema = qaRequestSchema
  .extend({
    userId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Deprecated external identity accepted only by the legacy route."),
  })
  .describe("Deprecated request shape for the legacy QA route.");

export const qaCategorizationSchema = z.strictObject({
  reformatted_question: z.string(),
  category: z.string(),
  subcategory: z.string(),
  issue_type: z.string(),
});

const nullableAgentAnswerSchema = z.string().nullable();

export const qaStreamEventSchema = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("progress"),
      message: z.string(),
    }),
    z.strictObject({
      type: z.literal("categorization"),
      data: qaCategorizationSchema,
    }),
    z.strictObject({
      type: z.literal("agent_responses"),
      data: z.strictObject({
        first_answer: nullableAgentAnswerSchema,
        second_answer: nullableAgentAnswerSchema,
        third_answer: nullableAgentAnswerSchema,
      }),
    }),
    z.strictObject({
      type: z.literal("calvin_review"),
      content: z.string().nullable(),
    }),
    z.strictObject({
      type: z.literal("reviewed_answer"),
      content: z.string(),
    }),
    z.strictObject({
      type: z.literal("refusal"),
      content: z.string(),
    }),
    z.strictObject({
      type: z.literal("error"),
      stage: z.string().min(1),
      message: z.string().min(1),
    }),
    z.strictObject({
      type: z.literal("done"),
    }),
  ])
  .describe("One NDJSON line emitted by the Counsel of Three pipeline.");

export type QaRequest = z.input<typeof qaRequestSchema>;
export type LegacyQaRequest = z.input<typeof legacyQaRequestSchema>;
export type QaStreamEvent = z.output<typeof qaStreamEventSchema>;
