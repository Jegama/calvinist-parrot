// langChainAgents/tools/bibleCrossReferencesTool.ts

import { tool } from "langchain";
import { z } from "zod";
import { getCrossReferences } from "@/utils/commentaryService";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getToolProgressWriter } from "@/utils/langChainAgents/tools/toolProgress";

async function bibleCrossReferences(
  input: { passages: string },
  config?: LangGraphRunnableConfig
): Promise<string> {
  const writer = getToolProgressWriter(config);

  try {
    const passages: string[] = JSON.parse(input.passages);

    writer?.({
      toolName: "Cross References",
      message: `Finding cross-references for ${passages.length} passage${passages.length !== 1 ? "s" : ""}...`,
    });

    const crossRefs = await getCrossReferences(passages);

    const totalRefs = Object.values(crossRefs)
      .join("")
      .split("→").length - 1;

    writer?.({
      toolName: "Cross References",
      message: `Found ${totalRefs} cross-reference${totalRefs !== 1 ? "s" : ""}`,
    });

    // Build a rich summary showing actual cross-references found
    const summaryParts: string[] = [];
    for (const [passage, refText] of Object.entries(crossRefs)) {
      // Extract just the reference arrows (e.g., "**Romans 9:13** → Gen 25:23; Mal 1:2-3")
      const lines = refText.split("\n").filter((l) => l.includes("→"));
      if (lines.length > 0) {
        // Show up to 8 cross-ref lines per passage to keep summary readable
        const displayed = lines.slice(0, 8);
        summaryParts.push(`${displayed.join("\n")}${lines.length > 8 ? `\n_...and ${lines.length - 8} more_` : ""}`);
      } else {
        summaryParts.push(`**${passage}** — No cross-references found`);
      }
    }

    writer?.({
      toolName: "Cross References",
      content: summaryParts.join("\n\n"),
    });

    return JSON.stringify(crossRefs);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    writer?.({
      toolName: "Cross References",
      message: `Cross-reference lookup failed: ${errorMsg.slice(0, 50)}${errorMsg.length > 50 ? "..." : ""}`,
    });
    writer?.({
      toolName: "Cross References",
      content: `### Cross-References Error\n\nUnable to retrieve cross-references.\n\n**Error**: ${errorMsg}`,
    });
    return JSON.stringify({ error: errorMsg });
  }
}

export const bibleCrossReferencesTool = tool(bibleCrossReferences, {
  name: "bibleCrossReferences",
  description: `Look up cross-references for Bible passages. Returns a list of related verses and passages from across Scripture for each input passage. Uses the Open Cross References dataset (344,799 cross-references).

Use when:
- The user asks "what other verses relate to X?"
- You want to show scriptural support or parallel passages
- Building a topical study across Scripture
- The user asks about connections between passages`,
  schema: z.object({
    passages: z
      .string()
      .describe(
        'JSON stringified array of Bible passages, e.g. \'["Romans 8:28", "John 3:16"]\''
      ),
  }),
});
