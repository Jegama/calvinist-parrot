// utils/langChainAgents/tools/index.ts

import { supplementalArticleSearchTool } from "./supplementalArticleSearchTool";
import { userMemoryRecallTool } from "./userMemoryRecallTool";
import { bibleCommentaryTool } from "./bibleCommentaryTool";
import { ccelRetrievalTool } from "./ccelRetrievalTool";
import { bibleCrossReferencesTool } from "./bibleCrossReferencesTool";
import { generalSearchTool } from "./generalSearchTool";

export const toolsArray = [
  supplementalArticleSearchTool,
  userMemoryRecallTool,
  bibleCommentaryTool,
  ccelRetrievalTool,
  bibleCrossReferencesTool,
  generalSearchTool,
];
