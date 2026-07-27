import { z } from "zod";

export const denominationSchema = z
  .enum([
    "reformed-baptist",
    "presbyterian",
    "wesleyan",
    "lutheran",
    "anglican",
    "pentecostal",
    "non-denom",
  ])
  .describe("The theological tradition used to frame secondary doctrines.");

export const resourceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .describe("An opaque resource identifier.");

export const requestIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .describe("An idempotency identifier for one user request and its response.");

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .describe("An RFC 3339 timestamp.");

export const errorResponseSchema = z
  .strictObject({
    error: z.string().min(1),
  })
  .describe("A request-level error returned before streaming begins.");

export type Denomination = z.infer<typeof denominationSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
