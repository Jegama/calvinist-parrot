import { z } from "zod";

export type OpenApiSchema = Record<string, unknown>;
export type OpenApiDocument = Record<string, unknown>;

export function schemaRef(name: string): OpenApiSchema {
  return { $ref: `#/components/schemas/${name}` };
}

export function zodToOpenApiSchema(
  schema: z.ZodType,
  io: "input" | "output" = "output",
): OpenApiSchema {
  const jsonSchema = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "throw",
  }) as OpenApiSchema;

  // OpenAPI 3.1 declares its JSON Schema dialect at the document level.
  // A nested `$schema` keyword is redundant and is rejected by some viewers.
  const { $schema: _schemaDialect, ...openApiSchema } = jsonSchema;
  void _schemaDialect;
  return openApiSchema;
}

export function jsonBody(schema: OpenApiSchema, example?: unknown) {
  return {
    "application/json": {
      schema,
      ...(example === undefined ? {} : { example }),
    },
  };
}

export function ndjsonBody(
  schema: OpenApiSchema,
  description: string,
  example?: unknown,
) {
  return {
    "application/x-ndjson": {
      schema,
      description,
      ...(example === undefined ? {} : { example }),
    },
  };
}
