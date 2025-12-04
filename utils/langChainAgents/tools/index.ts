// utils/langChainAgents/tools/index.ts

import { supplementalArticleSearchTool } from "./supplementalArticleSearchTool";
import { userMemoryRecallTool } from "./userMemoryRecallTool";
import { bibleCommentaryTool } from "./bibleCommentaryTool";
import { ccelRetrievalTool } from "./ccelRetrievalTool";

export const toolsArray = [
  supplementalArticleSearchTool,
  userMemoryRecallTool,
  bibleCommentaryTool,
  ccelRetrievalTool,
];
