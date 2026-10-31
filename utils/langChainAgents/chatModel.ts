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
    case "anthropic":
      return new ChatAnthropic({
        model: env.PARROT_ANTHROPIC_MODEL || "claude-haiku-5-5",
        apiKey: env.ANTHROPIC_API_KEY || "",
        streaming: true,
        maxTokens: 16_384,
        // Haiku 5.5 uses adaptive thinking and rejects sampling parameters.
        // Explicit thinking also preserves its blocks during tool-call rounds.
        thinking: { type: "adaptive" },
      });
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
