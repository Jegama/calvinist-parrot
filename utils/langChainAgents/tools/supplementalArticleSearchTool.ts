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
  const writer = (config as any)?.writer;
  
  // Time-based progress updates for slow operations
  let progressInterval: NodeJS.Timeout | null = null;
  
  try {
    // Emit progress start
    writer?.({ toolName: "Theological Research", message: "Connecting to theological resources..." });

    // Set up periodic progress updates for operations taking >2 seconds
    progressInterval = setInterval(() => {
      writer?.({ toolName: "Theological Research", message: "Still searching monergism.com and gotquestions.org..." });
    }, 3000);

    const response = await client.search(query.query, {
      searchDepth: "advanced",
      includeDomains: [
        "https://www.monergism.com/",
        "https://www.gotquestions.org/"
      ]
    });

    // Clear the interval once search completes
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    // Emit intermediate progress
    writer?.({ toolName: "Theological Research", message: "Processing search results..." });

    // Emit progress completion
    const resultCount = response.results?.length || 0;
    writer?.({ toolName: "Theological Research", message: `Found ${resultCount} article${resultCount !== 1 ? 's' : ''}` });

    console.log("Supplemental Article Search Response:", response);

    // 'response' is already a JSON object.
    return JSON.stringify(response);
  } catch (error) {
    // Clear interval if it's still running
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    writer?.({ toolName: "Theological Research", message: `⚠️ Search failed: ${errorMsg.slice(0, 50)}${errorMsg.length > 50 ? '...' : ''}` });
    writer?.({ toolName: "Theological Research", content: `### Research Error\n\nUnable to search theological resources at this time.\n\n**Error**: ${errorMsg}` });
    
    // Return valid JSON even on error so parsing doesn't fail downstream
    return JSON.stringify({ 
      results: [], 
      error: errorMsg
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