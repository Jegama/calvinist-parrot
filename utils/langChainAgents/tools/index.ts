// utils/langChainAgents/tools/index.ts

import { supplementalArticleSearchTool } from "./supplementalArticleSearchTool";
import { userMemoryRecallTool } from "./userMemoryRecallTool";

export const toolsArray = [
  supplementalArticleSearchTool,
  userMemoryRecallTool,
];
