// utils/langChainAgents/tools/supplementalArticleSearchTool.ts

import { tool } from "langchain";
import { tavily } from "@tavily/core";
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });

async function supplementalArticleSearch(
  query: { query: string },
  config?: LangGraphRunnableConfig
): Promise<string> {
  try {
    // Emit progress start
    config?.writer?.({ toolName: "supplementalArticleSearch", message: "Searching monergism.com and gotquestions.org..." });

    const response = await client.search(query.query, {
      searchDepth: "advanced",
      includeDomains: [
        "https://www.monergism.com/",
        "https://www.gotquestions.org/"
      ]
    });

    // Emit progress completion
    const resultCount = response.results?.length || 0;
    config?.writer?.({ toolName: "supplementalArticleSearch", message: `Found ${resultCount} articles` });

    // Format bibliography for tool summary
    const summary = response.results?.slice(0, 3).map((r: { title?: string; url?: string }) => 
      `- [${r.title || "Untitled"}](${r.url || "#"})`
    ).join("\n") || "No results found.";

    // Emit tool summary for persistence
    config?.writer?.({ toolName: "supplementalArticleSearch", content: `### Research Sources\n\n${summary}` });

    // 'response' is already a JSON object.
    return JSON.stringify(response);
  } catch (error) {
    config?.writer?.({ toolName: "supplementalArticleSearch", message: "Search failed" });
    // Return valid JSON even on error so parsing doesn't fail downstream
    return JSON.stringify({ 
      results: [], 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

// Use the helper function to create a tool with its schema and metadata.
export const supplementalArticleSearchTool = tool(
  supplementalArticleSearch,
  {
    name: "supplementalArticleSearch",
    description: "Given a theological query, returns search results to supplement the answer from monergism.com and gotquestions.org.",
    schema: z.object({
      query: z.string().describe("The query to use in your search."),
    }),
  }
);