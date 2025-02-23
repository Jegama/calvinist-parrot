// langChainAgents/tools/bibleCommentaryTool.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCommentariesForPassages } from "@/utils/commentaryService";

async function bibleCommentary(input: { input: string }): Promise<string> {
  try {
    // Expect input.input to be a JSON stringified array of passages.
    const passages: string[] = JSON.parse(input.input);
    const commentaries = await getCommentariesForPassages(passages);
    return JSON.stringify(commentaries);
  } catch (error) {
    return `Error: ${error}`;
  }
}

export const bibleCommentaryTool = tool(
  bibleCommentary,
  {
    name: "BibleCommentary",
    description: "Given a JSON array of Bible passages, returns Bible commentaries.",
    schema: z.object({
      input: z.string().describe("JSON stringified array of Bible passages"),
    }),
  }
);
