// utils/langChainAgents/tools/index.ts

import { ToolNode } from "@langchain/langgraph/prebuilt";

// Imported from your separate files
import { gotQuestionsSearchTool } from "./gotQuestionsSearchTool";
import { bibleCommentaryTool } from "./bibleCommentaryTool";
import { calvinReviewerTool } from "./calvinReviewerTool";

export const toolsArray = [
  gotQuestionsSearchTool,
  bibleCommentaryTool,
  calvinReviewerTool,
];

export const toolNode = new ToolNode(toolsArray);
