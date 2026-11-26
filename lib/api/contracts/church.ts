import { z } from "zod";
import { CORE_DOCTRINE_KEYS } from "@/lib/schemas/church-finder";
import { isoDateTimeSchema, resourceIdSchema } from "./common";

export const churchOperationKeySchema = z.uuid();
export const evaluationStatusSchema = z.enum(["recommended", "biblically_sound_with_differences", "limited_information", "not_endorsed"]);
const directoryTextFilter = z.string().trim().min(1).max(160);
const pageSizeSchema = z.int().min(1).max(25);

export const findChurchesInputSchema = z.strictObject({
  city: directoryTextFilter.optional().describe("Exact city name, ignoring case."),
  state: directoryTextFilter.optional().describe("Exact state or region on the same saved address, ignoring case."),
  denomination: directoryTextFilter.optional().describe("Exact directory denomination label, ignoring case."),
  status: z.enum(["historic_reformed", ...evaluationStatusSchema.options]).optional().describe("Filter by the latest saved evaluation, or by historic confession adoption."),
  page: z.int().min(1).max(1000000).default(1),
  pageSize: pageSizeSchema.default(10),
});

export const getChurchInputSchema = z.strictObject({
  id: resourceIdSchema,
  operationId: churchOperationKeySchema.describe("A UUID for this retrieval. Reuse it on retry."),
});

const churchSummarySchema = z.object({
  id: resourceIdSchema,
  name: z.string(),
  website: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  denomination: z.string().nullable(),
  confessionAdopted: z.boolean(),
  status: evaluationStatusSchema,
});

export const findChurchesResultSchema = z.object({
  items: z.array(churchSummarySchema).max(25),
  page: z.int().positive(),
  pageSize: pageSizeSchema,
  hasMore: z.boolean(),
});

export const publicChurchSchema = churchSummarySchema.extend({
  status: evaluationStatusSchema.nullable(),
  evaluationState: z.enum(["evaluated", "unevaluated"]),
  bestPages: z.object({
    beliefs: z.string().nullable(),
    confession: z.string().nullable(),
    about: z.string().nullable(),
    leadership: z.string().nullable(),
  }),
  evaluation: z.object({
    createdAt: isoDateTimeSchema,
    coreOnSiteCount: z.int(),
    coreTotalCount: z.int(),
    coverageRatio: z.number(),
    coreDoctrines: z.record(z.enum(CORE_DOCTRINE_KEYS), z.enum(["true", "false", "unknown"])),
    badges: z.array(z.string()).max(25),
    supportingLinks: z.array(z.httpUrl()).max(12),
  }).nullable(),
});

export const getChurchResultSchema = publicChurchSchema;
