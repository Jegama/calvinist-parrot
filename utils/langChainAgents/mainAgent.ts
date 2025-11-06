// utils/langChainAgents/mainAgent.ts

import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { toolsArray } from "./tools";

const model = new ChatOpenAI({
    model: "gpt-5-mini",
    streaming: true,
});

export const parrotWorkflow = createAgent({
    model,
    tools: toolsArray,
});
