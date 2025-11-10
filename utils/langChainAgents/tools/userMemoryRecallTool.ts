// utils/langChainAgents/tools/userMemoryRecallTool.ts

import { tool } from "langchain";
import { z } from "zod";
import { getMemoryStore, MemoryNamespaces, MemoryKeys, type UserProfileMemory } from "@/lib/langGraphStore";

async function recallUserMemory(input: { userId: string; query?: string }): Promise<string> {
  const { userId, query } = input;
  const store = getMemoryStore();

  try {
    const profileNs = MemoryNamespaces.userProfile(userId);
    const profileDoc = await store.get(profileNs, MemoryKeys.USER_PROFILE);
    const profile = (profileDoc?.value as UserProfileMemory) || null;

    let hits: Array<{ key: string; snippet: string }> = [];
    if (query) {
      const results = await store.search(["memories", userId], { query, limit: 5 });
      hits = results.map((r) => {
        const val = r?.value as unknown;
        let snippet = "";
        try {
          if (typeof val === "string") snippet = val;
          else if (val && typeof val === "object" && (val as Record<string, unknown>)["data"]) {
            snippet = String((val as Record<string, unknown>)["data"]);
          } else snippet = JSON.stringify(val);
        } catch {
          snippet = String(val);
        }
        return { key: r.key, snippet: snippet.slice(0, 300) };
      });
    }

    const topInterests = profile?.theologicalInterests
      ? (Object.entries(profile.theologicalInterests)
          .sort((a, b) => ((b[1]?.count || 0) as number) - ((a[1]?.count || 0) as number))
          .slice(0, 5)
          .map(([k, v]) => ({ topic: k, count: (v?.count as number) || 0 })) as Array<{ topic: string; count: number }>)
      : [];

    const payload = {
      userId,
      denomination: profile?.preferences?.denomination || null,
      topInterests,
      concerns: (profile?.personalContext?.concerns || []).slice(0, 5),
      spiritualJourney: (profile?.personalContext?.spiritualJourney || []).slice(-3),
      hits,
    };

    return JSON.stringify(payload);
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }
}

export const userMemoryRecallTool = tool(recallUserMemory, {
  name: "userMemoryRecall",
  description:
    "Recall long-term user memory. Provide userId and optional query. Returns preferences, top interests, concerns, and relevant memory snippets.",
  schema: z.object({
    userId: z.string().describe("The Appwrite/DB user id for namespacing memory."),
    query: z.string().optional().describe("Optional natural language query to search relevant memories."),
  }),
});
