// utils/langChainAgents/mainAgent.ts

import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { toolsArray } from "./tools";

const mini_model = "gpt-5-mini";

const llm = new ChatOpenAI({
    model: mini_model,
    streaming: true,
});

export const parrotWorkflow = createReactAgent({
    llm,
    tools: toolsArray,
});
