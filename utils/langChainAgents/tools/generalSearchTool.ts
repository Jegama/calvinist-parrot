// langChainAgents/tools/generalSearchTool.ts

import { tool } from "langchain";
import { tavily } from "@tavily/core";
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getToolProgressWriter } from "@/utils/langChainAgents/tools/toolProgress";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });

// Basic blocklist for obviously inappropriate queries
const BLOCKED_PATTERNS = [
  /\b(porn|xxx|nsfw|hentai)\b/i,
  /\bhow\s+to\s+(kill|murder|harm|poison)\s+(someone|a\s+person|people)\b/i,
  /\b(make|build|create)\s+(a\s+)?(bomb|explosive|weapon)\b/i,
];

function isQueryBlocked(query: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(query));
}

async function generalSearch(
  input: { query: string },
  config?: LangGraphRunnableConfig
): Promise<string> {
  const writer = getToolProgressWriter(config);

  let progressInterval: NodeJS.Timeout | null = null;

  try {
    if (isQueryBlocked(input.query)) {
      writer?.({
        toolName: "Web Search",
        message: "Query not permitted",
      });
      return JSON.stringify({
        results: [],
        message:
          "I'm not able to search for that type of content. Please ask a different question.",
      });
    }

    writer?.({
      toolName: "Web Search",
      message: "Searching the web...",
    });

    progressInterval = setInterval(() => {
      writer?.({
        toolName: "Web Search",
        message: "Still searching...",
      });
    }, 3000);

    const response = await client.search(input.query, {
      searchDepth: "basic",
    });

    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    const resultCount = response.results?.length || 0;
    writer?.({
      toolName: "Web Search",
      message: `Found ${resultCount} result${resultCount !== 1 ? "s" : ""}`,
    });

    // Format results with source links for the tool summary
    if (Array.isArray(response.results) && response.results.length > 0) {
      const links = response.results
        .filter((r: { url?: string }) => r.url)
        .slice(0, 5)
        .map((r: { title?: string; url?: string }) => {
          const title = r.title || "Untitled";
          return `- [${title}](${r.url})`;
        })
        .join("\n");

      if (links) {
        writer?.({
          toolName: "Web Search",
          content: `### Web Sources\n\n${links}`,
        });
      }
    }

    return JSON.stringify(response);
  } catch (error) {
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    writer?.({
      toolName: "Web Search",
      message: `Search failed: ${errorMsg.slice(0, 50)}${errorMsg.length > 50 ? "..." : ""}`,
    });
    writer?.({
      toolName: "Web Search",
      content: `### Web Search Error\n\nUnable to search the web at this time.\n\n**Error**: ${errorMsg}`,
    });

    return JSON.stringify({ results: [], error: errorMsg });
  }
}

export const generalSearchTool = tool(generalSearch, {
  name: "generalSearch",
  description: `Search the web for current events, factual lookups, science, health, general knowledge, practical questions, or when the user explicitly asks for web information.

IMPORTANT routing rules:
- For Bible/doctrine/theology → prefer supplementalArticleSearch, BibleCommentary, or studyBible tools
- For church history/classic theology → prefer ccelRetrieval
- Only fall back to generalSearch for theology if specialized tools cannot answer
- Do NOT use for inappropriate, explicit, or harmful queries`,
  schema: z.object({
    query: z.string().describe("The search query"),
  }),
});
