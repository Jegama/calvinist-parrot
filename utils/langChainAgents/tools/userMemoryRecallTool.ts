// utils/langChainAgents/tools/userMemoryRecallTool.ts

import { tool } from "langchain";
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  getMemoryStore,
  MemoryNamespaces,
  MemoryKeys,
  type UserProfileMemory,
} from "@/lib/langGraphStore";
import { getToolProgressWriter } from "@/utils/langChainAgents/tools/toolProgress";

async function recallUserMemory(
  input: {
    userId: string;
    query?: string;
    full?: boolean;
  },
  config?: LangGraphRunnableConfig
): Promise<string> {
  const { userId, query, full } = input;
  const writer = getToolProgressWriter(config);
  
  const store = getMemoryStore();
  let progressInterval: NodeJS.Timeout | null = null;

  try {
    // Emit progress start
    writer?.({ toolName: "userMemoryRecall", message: query ? "Searching user memories..." : "Recalling user context..." });
    
    // Set up periodic progress for slow memory operations
    progressInterval = setInterval(() => {
      writer?.({ toolName: "userMemoryRecall", message: query ? "Still searching memories..." : "Still gathering context..." });
      writer?.({ toolName: "userMemoryRecall", message: query ? "Still searching memories..." : "Still gathering context..." });
    }, 3000);

    // Get JSON store profile (unstructured memories only)
    const profileNs = MemoryNamespaces.userProfile(userId);
    const profileDoc = await store.get(profileNs, MemoryKeys.USER_PROFILE);
    const profile = (profileDoc?.value as UserProfileMemory) || null;

    // Semantic search across conversation-derived memories if query provided
    let hits: Array<{ key: string; snippet: string }> = [];
    if (query) {
      writer?.({ toolName: "Memory Recall", message: "Performing semantic search..." });
      
      const results = await store.search(["memories", userId], {
        query,
        limit: 5,
      });
      
      // Clear interval after search completes
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      
      hits = results.map((r) => {
        const val = r?.value as unknown;
        let snippet = "";
        try {
          if (typeof val === "string") snippet = val;
          else if (
            val &&
            typeof val === "object" &&
            (val as Record<string, unknown>)["data"]
          ) {
            snippet = String((val as Record<string, unknown>)["data"]);
          } else snippet = JSON.stringify(val);
        } catch {
          snippet = String(val);
        }
        return { key: r.key, snippet: snippet.slice(0, 300) };
      });
    }
    
    // Clear interval if it wasn't cleared earlier (for non-query path)
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    // Sort interests and include truncated contexts
    const sortedInterests = profile?.theologicalInterests
      ? Object.entries(profile.theologicalInterests).sort(
          (a, b) =>
            ((b[1]?.count || 0) as number) - ((a[1]?.count || 0) as number)
        )
      : [];
    const MAX_CONTEXTS_EXPOSED = 3; // keep recall payload lean
    const interests = (
      full ? sortedInterests : sortedInterests.slice(0, 5)
    ).map(([k, v]) => ({
      topic: k,
      count: (v?.count as number) || 0,
      contexts: full
        ? v?.contexts || []
        : (v?.contexts || []).slice(0, MAX_CONTEXTS_EXPOSED),
    }));

    // Preferred topics (from structured preferences merged into JSON) – expose truncated unless full
    const preferredTopicsRaw = profile?.preferences?.preferredTopics || [];
    const preferredTopics = full
      ? preferredTopicsRaw
      : preferredTopicsRaw.slice(0, 10);

    const payload = {
      userId,
      interests,
      preferredTopics,
      concerns: full
        ? profile?.personalContext?.concerns || []
        : (profile?.personalContext?.concerns || []).slice(0, 5),
      spiritualJourney: full
        ? profile?.personalContext?.spiritualJourney || []
        : (profile?.personalContext?.spiritualJourney || []).slice(-3),
      lifeStage: profile?.personalContext?.lifeStage || null,
      searchHits: hits,
      truncated: !full,
    };

    // Emit completion
    const interestCount = interests.length;
    const hitCount = hits.length;
    writer?.({ toolName: "Memory Recall", message: `Recalled ${interestCount} interest${interestCount !== 1 ? 's' : ''}${hitCount > 0 ? ` + ${hitCount} search result${hitCount !== 1 ? 's' : ''}` : ""}` });

    // Clear interval if it wasn't cleared earlier (for non-query path)
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    return JSON.stringify(payload);
  } catch (error) {
    // Clear interval if still running
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    writer?.({ toolName: "Memory Recall", message: `⚠️ Memory recall failed: ${errorMsg.slice(0, 50)}${errorMsg.length > 50 ? '...' : ''}` });
    writer?.({ toolName: "Memory Recall", content: `### Memory Recall Error\n\nUnable to access user memories at this time.\n\n**Error**: ${errorMsg}` });
    
    return JSON.stringify({
      error: errorMsg,
    });
  }
}

export const userMemoryRecallTool = tool(recallUserMemory, {
  name: "userMemoryRecall",
  description:
    "Recall unstructured user memories: theological interests (with limited recent contexts), preferredTopics, personal concerns, spiritual journey notes, life stage. Provide a precise 'query' to semantically search prior memory documents when you need a specific detail; avoid broad queries. Default response is truncated (top interests with up to 3 contexts each, first concerns, recent journey notes, up to 10 preferredTopics). Use full=true only for genuine holistic summaries (e.g., crafting an extended pastoral plan). Structured data (denomination, ministry context, learning preferences) is already in your system prompt.",
  schema: z.object({
    userId: z
      .string()
      .describe("The Appwrite/DB user id for namespacing memory."),
    query: z
      .string()
      .optional()
      .describe(
        "Optional natural language query to semantically search prior memories (not required to view top interests)."
      ),
    full: z
      .boolean()
      .optional()
      .describe(
        "Return complete memory lists (all interests + contexts, all concerns, journey notes, preferredTopics)."
      ),
  }),
});
