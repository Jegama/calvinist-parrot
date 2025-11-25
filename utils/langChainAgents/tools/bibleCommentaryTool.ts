// langChainAgents/tools/bibleCommentaryTool.ts

import { tool } from "langchain";
import { z } from "zod";
import { getCommentariesForPassages } from "@/utils/commentaryService";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

async function bibleCommentary(
  input: { passages: string },
  config?: LangGraphRunnableConfig
): Promise<string> {
  try {
    // Expect input.input to be a JSON stringified array of passages.
    const passages: string[] = JSON.parse(input.passages);
    
    // Emit progress start
    config?.writer?.({ toolName: "BibleCommentary", message: `Retrieving commentaries for ${passages.length} passage(s)...` });

    const commentaries = await getCommentariesForPassages(passages);
    
    // Emit completion progress
    config?.writer?.({ toolName: "BibleCommentary", message: "Commentaries retrieved" });

    // Format summary
    const passageList = passages.map(p => `- ${p}`).join("\n");
    config?.writer?.({ toolName: "BibleCommentary", content: `### Commentary References\n\n${passageList}` });

    return JSON.stringify(commentaries);
  } catch (error) {
    config?.writer?.({ toolName: "BibleCommentary", message: "Failed to retrieve commentaries" });
    return `Error: ${error}`;
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
