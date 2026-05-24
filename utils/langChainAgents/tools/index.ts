// utils/langChainAgents/tools/index.ts

import { supplementalArticleSearchTool } from "./supplementalArticleSearchTool";
import { userMemoryRecallTool } from "./userMemoryRecallTool";
import { bibleCommentaryTool } from "./bibleCommentaryTool";
// ccelRetrievalTool is temporarily disabled during the May 2026 evals so we can
// isolate the contribution of the other retrieval tools. Re-enable by restoring
// both the import below and the entry in toolsArray.
// import { ccelRetrievalTool } from "./ccelRetrievalTool";
import { bibleCrossReferencesTool } from "./bibleCrossReferencesTool";
import { generalSearchTool } from "./generalSearchTool";

export const toolsArray = [
  supplementalArticleSearchTool,
  userMemoryRecallTool,
  bibleCommentaryTool,
  // ccelRetrievalTool,
  bibleCrossReferencesTool,
  generalSearchTool,
];
