// lib/parrot-ai.ts
// Centralized LLM wrapper for OpenAI, Gemini, and Anthropic SDKs.
// Provides a single `generateStructured<T>()` method that routes to the correct provider.

import { DEFAULT_GEMINI_MODEL } from "@/lib/gemini-model";
import { fromJSONSchema, type ZodType } from "zod";
import {
  startUsageAttempt, recordUsageAttempt, type UsageAttempt, type UsageContext,
} from "./provider-usage";
import { usageTransport } from "./provider-usage-transport";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Provider = "openai" | "gemini" | "anthropic";

export interface ModelSpec {
  provider: Provider;
  model: string;
}

export type ThinkingEffort = "low" | "medium" | "high";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface JsonSchema {
  name: string;
  strict?: boolean;
  schema: Record<string, unknown>;
}

export interface StructuredOutputParams {
  modelSpec?: ModelSpec;
  messages: ChatMessage[];
  schema: JsonSchema;
  thinking?: ThinkingEffort;
  seed?: number;
  usage?: UsageContext;
  signal?: AbortSignal;
  validate?: (data: unknown) => boolean;
}

export interface StructuredOutputResult<T> {
  data: T;
  model: string;
  provider: Provider;
}

// ---------------------------------------------------------------------------
// Default model constants
// ---------------------------------------------------------------------------

export const DEFAULT_MODEL: ModelSpec = {
  provider: "gemini",
  model: DEFAULT_GEMINI_MODEL,
};

export const JOURNAL_MODEL: ModelSpec = {
  provider: "anthropic",
  model: "claude-haiku-5-5",
};

// ---------------------------------------------------------------------------
// Thinking-level mappings
// ---------------------------------------------------------------------------

const GEMINI_THINKING_MAP: Record<ThinkingEffort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

const validators = new WeakMap<JsonSchema, ZodType>();

// Anthropic supports minItems of 0 or 1. Keep other array bounds in the
// description and validate the original schema locally, including its enums.
function journalWireSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const wire = { ...schema };
  if (schema.properties) {
    const fields = schema.properties as Record<string, Record<string, unknown>>;
    wire.properties = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, journalWireSchema(value)])
    );
  }
  if (schema.items) wire.items = journalWireSchema(schema.items as Record<string, unknown>);
  if (schema.type === "array") {
    const bounds: string[] = [];
    if (typeof schema.minItems === "number" && schema.minItems > 1) {
      bounds.push(`at least ${schema.minItems} items`);
      delete wire.minItems;
    }
    if (typeof schema.maxItems === "number") {
      bounds.push(`at most ${schema.maxItems} items`);
      delete wire.maxItems;
    }
    if (bounds.length) wire.description = [schema.description, bounds.join(", ")].filter(Boolean).join(". ");
  }
  if (Array.isArray(schema.type)) {
    wire.anyOf = schema.type.map(type => ({ type }));
    delete wire.type;
  }
  return wire;
}

interface ProviderReceipt {
  model?: string;
  usage?: unknown;
  text: () => string | undefined;
}

async function readStructured<T>(
  spec: ModelSpec, receipt: ProviderReceipt, attempt?: UsageAttempt, params?: StructuredOutputParams,
): Promise<StructuredOutputResult<T>> {
  const durationMs = attempt ? Date.now() - attempt.startedAt.getTime() : 0;
  const record = (outcome: "received" | "invalid_output" | "success") =>
    attempt && recordUsageAttempt(attempt, outcome, durationMs, receipt.model, receipt.usage);
  await record("received");
  try {
    const text = receipt.text();
    if (!text) throw new Error(`Empty response from ${spec.provider} (${spec.model})`);
    const data = JSON.parse(text);
    if (attempt && params) {
      let validator = validators.get(params.schema);
      if (!validator) {
        validator = fromJSONSchema(params.schema.schema);
        validators.set(params.schema, validator);
      }
      if (!validator.safeParse(data).success) {
        throw new Error(`Invalid ${params.schema.name} response structure`);
      }
    }
    if (params?.validate && !params.validate(data)) {
      throw new Error(`Invalid ${params.schema.name} response structure`);
    }
    await record("success");
    return { data, model: receipt.model || spec.model, provider: spec.provider };
  } catch (error) {
    await record("invalid_output");
    throw error;
  }
}

// Church extraction uses the native Google schema and a stage-specific abort signal.
export async function generateGeminiStructured<T>(
  client: GoogleGenAI, request: GenerateContentParameters, usage?: UsageContext, params?: StructuredOutputParams,
): Promise<StructuredOutputResult<T>> {
  const spec: ModelSpec = { provider: "gemini", model: request.model };
  const attempt = usage && startUsageAttempt(usage, spec);
  if (attempt?.feature === "church" || attempt?.feature === "chat") await recordUsageAttempt(attempt, "started", 0);
  const response = await client.models.generateContent(request).catch(async error => {
    if (attempt) {
      // This SDK exposes the HTTP error envelope as JSON in ApiError.message.
      let body;
      if (error instanceof ApiError) {
        try { body = JSON.parse(error.message); } catch { /* no reported counters */ }
      }
      await recordUsageAttempt(attempt, "provider_error", Date.now() - attempt.startedAt.getTime(),
        typeof body?.modelVersion === "string" ? body.modelVersion : undefined, body?.usageMetadata);
    }
    throw error;
  });

  return readStructured<T>(spec, {
    model: response.modelVersion, usage: response.usageMetadata, text: () => response.text,
  }, attempt, params);
}

// ---------------------------------------------------------------------------
// ParrotAI class
// ---------------------------------------------------------------------------

class ParrotAI {
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenAI | null = null;
  private anthropicClient: Anthropic | null = null;

  // Lazy-init SDK clients ------------------------------------------------

  private getOpenAIClient(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openaiClient;
  }

  private getGeminiClient(): GoogleGenAI {
    if (!this.geminiClient) {
      this.geminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY || "",
      });
    }
    return this.geminiClient;
  }

  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      this.anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
    return this.anthropicClient;
  }

  // Main entry point -----------------------------------------------------

  async generateStructured<T>(
    params: StructuredOutputParams
  ): Promise<StructuredOutputResult<T>> {
    const spec = params.modelSpec ?? DEFAULT_MODEL;

    switch (spec.provider) {
      case "gemini":
        return this.callGemini<T>(spec, params);
      case "openai":
        return this.callOpenAI<T>(spec, params);
      case "anthropic":
        return this.callAnthropic<T>(spec, params);
      default:
        throw new Error(`Unsupported provider: ${spec.provider}`);
    }
  }

  // Provider implementations ---------------------------------------------

  private async callGemini<T>(
    spec: ModelSpec,
    params: StructuredOutputParams
  ): Promise<StructuredOutputResult<T>> {
    const genai = this.getGeminiClient();

    // Extract system message (Gemini uses config.systemInstruction)
    const systemMessage = params.messages.find((m) => m.role === "system");
    const nonSystemMessages = params.messages.filter(
      (m) => m.role !== "system"
    );

    const contents = nonSystemMessages.map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const config: Record<string, unknown> = {
      abortSignal: params.signal,
      responseMimeType: "application/json",
      responseJsonSchema: params.schema.schema,
    };

    if (systemMessage) {
      config.systemInstruction = systemMessage.content;
    }

    if (params.seed !== undefined) {
      config.seed = params.seed;
    }

    if (params.thinking) {
      config.thinkingConfig = {
        thinkingLevel: GEMINI_THINKING_MAP[params.thinking],
      };
    }

    return generateGeminiStructured<T>(genai, {
      model: spec.model, contents, config,
    }, params.usage, params);
  }

  private async callOpenAI<T>(
    spec: ModelSpec,
    params: StructuredOutputParams
  ): Promise<StructuredOutputResult<T>> {
    const openai = this.getOpenAIClient();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] =
      params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

    if (params.thinking) {
      // Use responses.parse for reasoning models
      const response = await openai.responses.parse({
        model: spec.model,
        input: messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content as string,
        })),
        text: {
          format: {
            type: "json_schema" as const,
            name: params.schema.name,
            strict: params.schema.strict ?? true,
            schema: params.schema.schema,
          },
        },
        reasoning: { effort: params.thinking },
      }, { signal: params.signal });

      if (!response.output_parsed) {
        throw new Error(`No parsed output from OpenAI (${spec.model})`);
      }

      return {
        data: response.output_parsed as T,
        model: spec.model,
        provider: "openai",
      };
    }

    // Use chat.completions for non-reasoning calls
    const response = await openai.chat.completions.create({
      model: spec.model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: params.schema.name,
          strict: params.schema.strict ?? true,
          schema: params.schema.schema,
        },
      },
    }, { signal: params.signal });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`Empty response from OpenAI (${spec.model})`);
    }

    const data = JSON.parse(content) as T;
    return { data, model: spec.model, provider: "openai" };
  }

  private async callAnthropic<T>(
    spec: ModelSpec,
    params: StructuredOutputParams
  ): Promise<StructuredOutputResult<T>> {
    let anthropic = this.getAnthropicClient();

    // Extract system message (Anthropic uses top-level `system` param)
    const systemMessage = params.messages.find((m) => m.role === "system");
    const nonSystemMessages = params.messages.filter(
      (m) => m.role !== "system"
    );

    const messages: Anthropic.MessageParam[] = nonSystemMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const transport = params.usage && usageTransport(params.usage, spec);
    if (transport) anthropic = anthropic.withOptions({ fetch: transport.fetch });
    const haiku55 = /^claude-haiku-5-5(?:$|-\d{8}$)/.test(spec.model);
    const response = await anthropic.messages.create({
      model: spec.model,
      max_tokens: 8192,
      system: systemMessage?.content,
      messages,
      output_config: {
        format: {
          type: "json_schema",
          schema: haiku55 ? journalWireSchema(params.schema.schema) : params.schema.schema,
        },
        ...(haiku55 && params.thinking && { effort: params.thinking }),
      },
      thinking: !params.thinking ? { type: "disabled" }
        : haiku55 ? { type: "adaptive" } : { type: "enabled", budget_tokens: 4096 },
    }, { signal: params.signal }).catch(transport?.onError);

    return readStructured<T>(spec, {
      model: response.model, usage: response.usage,
      text: () => response.content.find(block => block.type === "text")?.text,
    }, transport?.attempt, params);
  }
}

// Module-level singleton
export const parrotAI = new ParrotAI();
