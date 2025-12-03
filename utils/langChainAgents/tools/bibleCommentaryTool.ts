// langChainAgents/tools/bibleCommentaryTool.ts

import { tool } from "langchain";
import { z } from "zod";
import { getCommentariesForPassages } from "@/utils/commentaryService";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getToolProgressWriter } from "@/utils/langChainAgents/tools/toolProgress";

async function bibleCommentary(
  input: { passages: string },
  config?: LangGraphRunnableConfig
): Promise<string> {
  const writer = getToolProgressWriter(config);
  
  let progressInterval: NodeJS.Timeout | null = null;
  
  try {
    // Expect input.input to be a JSON stringified array of passages.
    const passages: string[] = JSON.parse(input.passages);
    
    // Emit progress start
    writer?.({ toolName: "Bible Commentary", message: `Retrieving commentaries for ${passages.length} passage${passages.length !== 1 ? 's' : ''}...` });

    // Set up periodic progress for slow commentary fetches
    progressInterval = setInterval(() => {
      writer?.({ toolName: "Bible Commentary", message: "Still gathering commentaries..." });
    }, 3000);

    const commentaries = await getCommentariesForPassages(passages);
    
    // Clear interval
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    // Emit completion progress
    writer?.({ toolName: "Bible Commentary", message: "Commentaries retrieved successfully" });

    // Format summary
    const passageList = passages.map(p => `- ${p}`).join("\n");
    writer?.({ toolName: "Bible Commentary", content: `### Commentary References\n\n${passageList}` });

    return JSON.stringify(commentaries);
  } catch (error) {
    // Clear interval if still running
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    writer?.({ toolName: "Bible Commentary", message: `⚠️ Commentary retrieval failed: ${errorMsg.slice(0, 50)}${errorMsg.length > 50 ? '...' : ''}` });
    writer?.({ toolName: "Bible Commentary", content: `### Commentary Error\n\nUnable to retrieve commentaries at this time.\n\n**Error**: ${errorMsg}` });
    
    return JSON.stringify({ error: errorMsg });
  }
}

export const bibleCommentaryTool = tool(
  bibleCommentary,
  {
    name: "BibleCommentary",
    description: "Given a JSON array of Bible passages, returns Bible commentaries.",
    schema: z.object({
      passages: z.string().describe("JSON stringified array of Bible passages"),
    }),
  }
);
