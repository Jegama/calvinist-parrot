import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI, ChatOpenAIResponses } from "@langchain/openai";

import { ChatUsageCaller } from "./chatUsage";
import { MCP_GUEST_MAX_OUTPUT, MCP_GUEST_MODEL, McpLimitError, reserveGuestModelAttempt } from "@/lib/mcp/limits";
import { DEFAULT_GEMINI_MODEL } from "@/lib/gemini-model";

/** Select the conversational agent's model independently of auxiliary features. */
export function createParrotChatModel(
  env: Record<string, string | undefined> = process.env,
  mode?: "mcp_guest",
) {
  const provider = (
    env.PARROT_AGENT_PROVIDER?.trim() || "anthropic"
  ).toLowerCase();

  const guest = mode === "mcp_guest";
  const anthropicModel = env.PARROT_ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";
  if (guest && (provider !== "anthropic" || anthropicModel !== MCP_GUEST_MODEL)) {
    throw new McpLimitError("Guest chat is unavailable for this model configuration.", 503);
  }

  switch (provider) {
    case "anthropic": {
      const model = anthropicModel;
      const chat = new ChatAnthropic({
        model,
        apiKey: env.ANTHROPIC_API_KEY || "",
        streaming: true,
        maxTokens: guest ? MCP_GUEST_MAX_OUTPUT : 16_384,
        ...(guest ? {
          // The reservation covers direct Claude API standard-tier pricing.
          clientOptions: { baseURL: "https://api.anthropic.com" },
          invocationKwargs: { service_tier: "standard_only" },
        } : {}),
        // Configure the default explicitly; other models use their API defaults.
        // Older overrides such as Haiku 4.5 reject adaptive thinking.
        ...(model === "claude-haiku-5-5"
          ? { thinking: { type: "adaptive" as const } }
          : {}),
      });
      chat.caller = guest
        ? new ChatUsageCaller({ provider, model }, "agent", { maxRetries: 1 }, reserveGuestModelAttempt)
        : new ChatUsageCaller({ provider, model });
      return chat;
    }
    case "openai": {
      const model = env.PARROT_OPENAI_MODEL || "gpt-6-luna";
      const settings = {
        model,
        apiKey: env.OPENAI_API_KEY || "",
        streaming: true,
      };
      const responses = new ChatOpenAIResponses(settings);
      responses.caller = new ChatUsageCaller({ provider, model });
      return new ChatOpenAI({
        ...settings, responses,
        // GPT-6 Luna needs Responses for tool calling with reasoning enabled.
        useResponsesApi: true,
      });
    }
    case "gemini": {
      const model = env.PARROT_GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
      const chat = new ChatGoogleGenerativeAI({
        model,
        apiKey: env.GEMINI_API_KEY || "",
        streaming: true,
      });
      chat.caller = new ChatUsageCaller({ provider, model });
      return chat;
    }
    default:
      throw new Error(`Unsupported PARROT_AGENT_PROVIDER: ${provider}`);
  }
}
