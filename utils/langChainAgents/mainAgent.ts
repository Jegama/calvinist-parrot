// utils/langChainAgents/mainAgent.ts

import { createAgent } from "langchain";
import { createParrotChatModel } from "./chatModel";
import { toolsArray } from "./tools";
import { getStudyBibleTools } from "./tools/studyBibleMcpTools";
import { getMemoryStore } from "@/lib/langGraphStore";

const model = createParrotChatModel();

// Get the shared memory store for long-term cross-thread memories
const memoryStore = getMemoryStore();

// Lazy singleton: initialized on first request, then reused
let parrotWorkflowInstance: ReturnType<typeof createAgent> | null = null;
let initPromise: Promise<ReturnType<typeof createAgent>> | null = null;

async function initParrotWorkflow() {
    // Load Study Bible MCP tools (returns empty array if URL not configured)
    const mcpTools = await getStudyBibleTools();

    const allTools = [...toolsArray, ...mcpTools];

    return createAgent({
        model,
        tools: allTools,
        store: memoryStore,
    });
}

/**
 * Returns the parrot workflow agent, initializing it lazily on first call.
 * MCP tools are loaded once and cached for all subsequent requests.
 */
export async function getParrotWorkflow() {
    if (parrotWorkflowInstance) {
        return parrotWorkflowInstance;
    }

    // Use a single init promise to prevent concurrent initialization
    if (!initPromise) {
        initPromise = initParrotWorkflow().then((workflow) => {
            parrotWorkflowInstance = workflow;
            return workflow;
        });
    }

    return initPromise;
}

// Backward compatibility: synchronous export for callers that don't use MCP tools.
// This creates the agent with only the static tools. Prefer getParrotWorkflow() instead.
export const parrotWorkflow = createAgent({
    model,
    tools: toolsArray,
    store: memoryStore,
});
