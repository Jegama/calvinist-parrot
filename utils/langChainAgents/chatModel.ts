import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

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
      return new ChatAnthropic({
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
    }
    case "openai":
      return new ChatOpenAI({
        model: env.PARROT_OPENAI_MODEL || "gpt-6-luna",
        apiKey: env.OPENAI_API_KEY || "",
        streaming: true,
        // GPT-6 Luna needs Responses for tool calling with reasoning enabled.
        useResponsesApi: true,
      });
    case "gemini":
      return new ChatGoogleGenerativeAI({
        model: env.PARROT_GEMINI_MODEL || "gemini-3.8-flash",
        apiKey: env.GEMINI_API_KEY || "",
        streaming: true,
      });
    default:
      throw new Error(`Unsupported PARROT_AGENT_PROVIDER: ${provider}`);
  }
}
