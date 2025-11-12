// utils/langChainAgents/tools/userMemoryRecallTool.ts

import { tool } from "langchain";
import { z } from "zod";
import {
  getMemoryStore,
  MemoryNamespaces,
  MemoryKeys,
  type UserProfileMemory,
} from "@/lib/langGraphStore";

async function recallUserMemory(input: {
  userId: string;
  query?: string;
  full?: boolean;
}): Promise<string> {
  const { userId, query, full } = input;
  const store = getMemoryStore();

  try {
    // Get JSON store profile (unstructured memories only)
    const profileNs = MemoryNamespaces.userProfile(userId);
    const profileDoc = await store.get(profileNs, MemoryKeys.USER_PROFILE);
    const profile = (profileDoc?.value as UserProfileMemory) || null;

    // Semantic search across conversation-derived memories if query provided
    let hits: Array<{ key: string; snippet: string }> = [];
    if (query) {
      const results = await store.search(["memories", userId], {
        query,
        limit: 5,
      });
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
    return JSON.stringify(payload);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
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
