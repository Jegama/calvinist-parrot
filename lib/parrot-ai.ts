// lib/parrot-ai.ts
// Centralized LLM wrapper for OpenAI, Gemini, and Anthropic SDKs.
// Provides a single `generateStructured<T>()` method that routes to the correct provider.

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

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
  model: "gemini-3-flash-preview",
};

export const LARGER_MODEL: ModelSpec = {
  provider: "gemini",
  model: "gemini-3-pro-preview",
};

// ---------------------------------------------------------------------------
// Thinking-level mappings
// ---------------------------------------------------------------------------

const GEMINI_THINKING_MAP: Record<ThinkingEffort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

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

    const response = await genai.models.generateContent({
      model: spec.model,
      contents,
      config,
    });

    if (!response.text) {
      throw new Error(`Empty response from Gemini (${spec.model})`);
    }

    const data = JSON.parse(response.text) as T;
    return { data, model: spec.model, provider: "gemini" };
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
      });

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
    });

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
    const anthropic = this.getAnthropicClient();

    // Extract system message (Anthropic uses top-level `system` param)
    const systemMessage = params.messages.find((m) => m.role === "system");
    const nonSystemMessages = params.messages.filter(
      (m) => m.role !== "system"
    );

    const messages: Anthropic.MessageParam[] = nonSystemMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const response = await anthropic.messages.create({
      model: spec.model,
      max_tokens: 8192,
      system: systemMessage?.content,
      messages,
      output_config: {
        format: {
          type: "json_schema",
          schema: params.schema.schema,
        },
      },
      thinking: params.thinking
        ? { type: "enabled", budget_tokens: 4096 }
        : { type: "disabled" },
    });

    // Extract text content from Anthropic response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(`No text content from Anthropic (${spec.model})`);
    }

    const data = JSON.parse(textBlock.text) as T;
    return { data, model: spec.model, provider: "anthropic" };
  }
}

// Module-level singleton
export const parrotAI = new ParrotAI();
