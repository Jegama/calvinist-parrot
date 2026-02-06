// utils/langChainAgents/mainAgent.ts

import { createAgent } from "langchain";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { toolsArray } from "./tools";
import { getMemoryStore } from "@/lib/langGraphStore";

const model = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
    streaming: true,
    apiKey: process.env.GEMINI_API_KEY || "",
});

// Get the shared memory store for long-term cross-thread memories
const memoryStore = getMemoryStore();

export const parrotWorkflow = createAgent({
    model,
    tools: toolsArray,
    store: memoryStore, // Enable long-term memory
});
