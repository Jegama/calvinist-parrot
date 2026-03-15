// langChainAgents/tools/bibleCommentaryTool.ts

import { tool } from "langchain";
import { z } from "zod";
import { getCommentariesForPassages, COMMENTARY_REGISTRY } from "@/utils/commentaryService";
import { parseReference } from "@/utils/parseReference";
import { getBookId, isOldTestament } from "@/utils/bookMappings";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getToolProgressWriter } from "@/utils/langChainAgents/tools/toolProgress";

async function bibleCommentary(
  input: { passages: string; commentaries?: string },
  config?: LangGraphRunnableConfig
): Promise<string> {
  const writer = getToolProgressWriter(config);

  const formatExcerpt = (text: string, maxLength = 340) => {
    const compact = text.replace(/\s+/g, " ").trim();
    if (compact.length <= maxLength) return compact;
    return `${compact.slice(0, maxLength)}...`;
  };

  const extractSourceName = (block: string, fallback: string) => {
    const match = block.match(/^\[([^\]]+)\]\s+Commentary on/im);
    return match?.[1]?.trim() || fallback;
  };

  const extractInsightSnippet = (block: string) => {
    const withoutHeader = block
      .replace(/^\[[^\]]+\]\s+Commentary on[^\n]*:\s*/i, "")
      .trim();

    const versesMatch = withoutHeader.match(/Verses [^\n]*:\s*([\s\S]+)/i);
    const preferred = (versesMatch?.[1] || withoutHeader).trim();
    return formatExcerpt(preferred);
  };

  let progressInterval: NodeJS.Timeout | null = null;

  try {
    // Expect input.passages to be a JSON stringified array of passages.
    const passages: string[] = JSON.parse(input.passages);

    // Parse optional commentaries array, default to matthew-henry
    let commentaryIds: string[] = ["matthew-henry"];
    if (input.commentaries) {
      try {
        commentaryIds = JSON.parse(input.commentaries);
      } catch {
        // If not valid JSON, treat as single ID
        commentaryIds = [input.commentaries];
      }
    }

    const commentaryLabel = commentaryIds.length === 1
      ? commentaryIds[0]
      : `${commentaryIds.length} commentaries`;

    // Emit progress start
    writer?.({ toolName: "Bible Commentary", message: `Retrieving ${commentaryLabel} for ${passages.length} passage${passages.length !== 1 ? 's' : ''}...` });

    // Set up periodic progress for slow commentary fetches
    progressInterval = setInterval(() => {
      writer?.({ toolName: "Bible Commentary", message: "Still gathering commentaries..." });
    }, 5000);

    const commentaries = await getCommentariesForPassages(passages, commentaryIds);

    // Clear interval
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    // Emit completion progress
    writer?.({ toolName: "Bible Commentary", message: "Commentaries retrieved successfully" });

    // Build a rich summary showing consulted sources + digestible excerpts + diagnostics
    const summaryLines: string[] = [];
    const unknownRequested = commentaryIds.filter((id) => !COMMENTARY_REGISTRY[id]);

    if (unknownRequested.length > 0) {
      summaryLines.push(
        `### Diagnostics\n\nUnknown commentary IDs requested: ${unknownRequested.map((id) => `\`${id}\``).join(", ")}`
      );
    }

    for (const passage of passages) {
      const parsed = parseReference(passage);
      const bookId = parsed ? getBookId(parsed.book) : null;
      const isNT = bookId ? !isOldTestament(bookId) : false;

      const consulted: string[] = [];
      const skipped: string[] = [];

      for (const id of commentaryIds) {
        const entry = COMMENTARY_REGISTRY[id];
        if (!entry) continue;
        if (entry.otOnly && isNT) {
          skipped.push(`${entry.name} _(OT only)_`);
        } else {
          consulted.push(entry.name);
        }
      }

      let line = `**${passage}** — ${consulted.join(", ") || "No valid commentary source selected"}`;
      if (skipped.length > 0) {
        line += `\n  _Skipped: ${skipped.join(", ")}_`;
      }

      const combinedCommentary = commentaries[passage];
      if (typeof combinedCommentary === "string" && combinedCommentary.trim().length > 0) {
        const blocks = combinedCommentary
          .split("\n\n---\n\n")
          .map((block) => block.trim())
          .filter(Boolean);

        if (blocks.length > 0) {
          const renderedBlocks = blocks.slice(0, 3).map((block, index) => {
            const source = extractSourceName(block, `Source ${index + 1}`);
            const lower = block.toLowerCase();
            const isError = lower.includes("error fetching commentary") || lower.includes("error loading commentary");
            if (isError) {
              return `- **${source}**: Failed to load commentary.`;
            }
            return `- **${source}**: ${extractInsightSnippet(block)}`;
          });

          line += `\n\n**Highlights**\n${renderedBlocks.join("\n")}`;

          if (blocks.length > 3) {
            line += `\n- _...and ${blocks.length - 3} more source section${blocks.length - 3 === 1 ? "" : "s"} in the full payload._`;
          }
        }
      }

      summaryLines.push(line);
    }

    writer?.({ toolName: "Bible Commentary", content: summaryLines.join("\n\n") });

    return JSON.stringify(commentaries);
  } catch (error) {
    // Clear interval if still running
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    writer?.({ toolName: "Bible Commentary", message: `Commentary retrieval failed: ${errorMsg.slice(0, 50)}${errorMsg.length > 50 ? '...' : ''}` });
    writer?.({ toolName: "Bible Commentary", content: `### Commentary Error\n\nUnable to retrieve commentaries at this time.\n\n**Error**: ${errorMsg}` });

    return JSON.stringify({ error: errorMsg });
  }
}

export const bibleCommentaryTool = tool(
  bibleCommentary,
  {
    name: "BibleCommentary",
    description: `Given a JSON array of Bible passages and optional commentary IDs, returns Bible commentaries.

Available commentaries:
- "matthew-henry" (default) — Pastoral, devotional, accessible
- "john-gill" — Deep Reformed exegesis, thorough verse-by-verse
- "jamieson-fausset-brown" — Balanced academic-pastoral commentary
- "adam-clarke" — Methodist perspective, linguistic notes
- "keil-delitzsch" — OT ONLY, Hebrew exegesis (do NOT use for NT passages)
- "tyndale" — Modern, accessible, evangelical

Selection guidance:
- OT Hebrew exegesis → keil-delitzsch + john-gill
- NT depth → john-gill + jamieson-fausset-brown
- Pastoral/devotional → matthew-henry
- Modern/accessible → tyndale
- Default (no preference) → matthew-henry`,
    schema: z.object({
      passages: z.string().describe("JSON stringified array of Bible passages, e.g. '[\"John 3:16\", \"Romans 8:28-30\"]'"),
      commentaries: z.string().optional().describe("JSON stringified array of commentary IDs to fetch, e.g. '[\"matthew-henry\", \"john-gill\"]'. Defaults to [\"matthew-henry\"] if omitted."),
    }),
  }
);
