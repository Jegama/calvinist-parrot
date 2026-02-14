// utils/langChainAgents/mainAgent.ts

import { createAgent } from "langchain";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { toolsArray } from "./tools";
import { getMemoryStore } from "@/lib/langGraphStore";

const selectedProvider = (process.env.PARROT_AGENT_PROVIDER || "gemini").toLowerCase();

const model =
    selectedProvider === "openai"
        ? new ChatOpenAI({
              model: process.env.PARROT_OPENAI_MODEL || "gpt-5-mini",
              streaming: true,
              apiKey: process.env.OPENAI_API_KEY || "",
          })
        : new ChatGoogleGenerativeAI({
              model: process.env.PARROT_GEMINI_MODEL || "gemini-3-flash-preview",
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

// Why do bad things happen to good people?