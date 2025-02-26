// utils/langChainAgents/tools/index.ts

import { ToolNode } from "@langchain/langgraph/prebuilt";

// Imported from your separate files
import { supplementalArticleSearchTool } from "./supplementalArticleSearchTool";
import { bibleCommentaryTool } from "./bibleCommentaryTool";
import { calvinReviewerTool } from "./calvinReviewerTool";

export const toolsArray = [
  supplementalArticleSearchTool,
  bibleCommentaryTool,
  calvinReviewerTool,
];

export const toolNode = new ToolNode(toolsArray);
