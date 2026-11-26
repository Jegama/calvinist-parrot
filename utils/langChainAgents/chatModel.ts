import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI, ChatOpenAIResponses } from "@langchain/openai";

import { ChatUsageCaller } from "./chatUsage";
import { DEFAULT_GEMINI_MODEL } from "@/lib/gemini-model";

/** Select the conversational agent's model independently of auxiliary features. */
export function createParrotChatModel(
  env: Record<string, string | undefined> = process.env,
) {
  const provider = (
    env.PARROT_AGENT_PROVIDER?.trim() || "anthropic"
  ).toLowerCase();

  switch (provider) {
    case "anthropic": {
      const model = env.PARROT_ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";
      const chat = new ChatAnthropic({
        model,
        apiKey: env.ANTHROPIC_API_KEY || "",
        streaming: true,
        maxTokens: 16_384,
        // Configure the default explicitly; other models use their API defaults.
        // Older overrides such as Haiku 4.5 reject adaptive thinking.
        ...(model === "claude-haiku-5-5"
          ? { thinking: { type: "adaptive" as const } }
          : {}),
      });
      chat.caller = new ChatUsageCaller({ provider, model });
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
