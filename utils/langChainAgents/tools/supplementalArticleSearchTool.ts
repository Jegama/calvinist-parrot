// utils/langChainAgents/tools/supplementalArticleSearchTool.ts

import { tool } from "@langchain/core/tools";
import { tavily } from "@tavily/core";
import { z } from "zod";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });

async function supplementalArticleSearch(query: { query: string }): Promise<string> {
  try {
    const response = await client.search(query.query, {
      searchDepth: "advanced",
      includeDomains: [
        "https://www.monergism.com/",
        "https://www.gotquestions.org/"
      ]
    });
    // 'response' is already a JSON object.
    return JSON.stringify(response);
  } catch (error) {
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