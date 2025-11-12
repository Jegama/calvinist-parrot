// utils/langChainAgents/mainAgent.ts

import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { toolsArray } from "./tools";
import { getMemoryStore } from "@/lib/langGraphStore";

const model = new ChatOpenAI({
    model: "gpt-5-mini",
    streaming: true,
});

// Get the shared memory store for long-term cross-thread memories
const memoryStore = getMemoryStore();

export const parrotWorkflow = createAgent({
    model,
    tools: toolsArray,
    store: memoryStore, // Enable long-term memory
});
