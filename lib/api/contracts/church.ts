import { z } from "zod";
import { resourceIdSchema } from "./common";

export const churchOperationKeySchema = z.uuid();

export const publicChurchSchema = z.object({
  id: resourceIdSchema,
  name: z.string(),
  website: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  status: z.enum(["recommended", "biblically_sound_with_differences", "limited_information", "not_endorsed"]).nullable(),
  bestPages: z.object({
    beliefs: z.string().nullable(),
    confession: z.string().nullable(),
    about: z.string().nullable(),
    leadership: z.string().nullable(),
  }),
});
