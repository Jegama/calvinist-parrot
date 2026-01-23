// utils/journal/llm.ts
// AI pipeline for Coram Deo Journal (Phase 2)
// Handles pastoral reflection (Call 1a/1b/1c) and tags/suggestions (Call 2)
// Uses parallel execution for faster UX

import OpenAI from "openai";
import prisma from "@/lib/prisma";
import type { Call1aOutput, Call1bOutput, Call1cOutput, Call1Output, Call2Output } from "@/types/journal";
import {
  JOURNAL_CALL1A_SCHEMA,
  JOURNAL_CALL1B_SCHEMA,
  JOURNAL_CALL1C_SCHEMA,
  JOURNAL_CALL2_SCHEMA,
} from "@/lib/schemas/journal";
import {
  buildCall1SystemPrompt,
  buildCall1aUserMessage,
  buildCall1bUserMessage,
  buildCall1cUserMessage,
  JOURNAL_CALL2_SYSTEM_PROMPT,
  buildCall2UserMessage,
  flattenTags,
} from "@/lib/prompts/journal";

const MODEL = "gpt-5-mini";
const PROMPT_VERSION = "1.0.0";

/**
 * Run Call 1a: Quick Overview (title, summary, situation)
 * This is the fast first paint - runs first to get summary for other calls
 */
export async function runCall1a(params: {
  entryText: string;
  recentSummaries: string[];
  preferredDepth: string;
}): Promise<Call1aOutput> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildCall1SystemPrompt("a", params.preferredDepth);
  const userMessage = buildCall1aUserMessage({
    entryText: params.entryText,
    recentSummaries: params.recentSummaries,
  });

  const response = await openai.responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    text: {
      format: {
        type: "json_schema",
        name: JOURNAL_CALL1A_SCHEMA.name,
        strict: true,
        schema: JOURNAL_CALL1A_SCHEMA.schema,
      },
    },
    reasoning: { effort: "low" },
  });

  if (!response.output_parsed) {
    throw new Error("No response from Call 1a LLM");
  }

  return response.output_parsed as unknown as Call1aOutput;
}

/**
 * Run Call 1b: Heart Analysis (heartReflection, putOffPutOn)
 */
export async function runCall1b(params: {
  entryText: string;
  situationSummary: string;
  preferredDepth: string;
}): Promise<Call1bOutput> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildCall1SystemPrompt("b", params.preferredDepth);
  const userMessage = buildCall1bUserMessage({
    entryText: params.entryText,
    situationSummary: params.situationSummary,
  });

  const response = await openai.responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    text: {
      format: {
        type: "json_schema",
        name: JOURNAL_CALL1B_SCHEMA.name,
        strict: true,
        schema: JOURNAL_CALL1B_SCHEMA.schema,
      },
    },
    reasoning: { effort: "low" },
  });

  if (!response.output_parsed) {
    throw new Error("No response from Call 1b LLM");
  }

  return response.output_parsed as unknown as Call1bOutput;
}

/**
 * Run Call 1c: Biblical Guidance (scripture, practicalNextSteps, safetyFlags)
 */
export async function runCall1c(params: {
  entryText: string;
  situationSummary: string;
  preferredDepth: string;
}): Promise<Call1cOutput> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildCall1SystemPrompt("c", params.preferredDepth);
  const userMessage = buildCall1cUserMessage({
    entryText: params.entryText,
    situationSummary: params.situationSummary,
  });

  const response = await openai.responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    text: {
      format: {
        type: "json_schema",
        name: JOURNAL_CALL1C_SCHEMA.name,
        strict: true,
        schema: JOURNAL_CALL1C_SCHEMA.schema,
      },
    },
    reasoning: { effort: "low" },
  });

  if (!response.output_parsed) {
    throw new Error("No response from Call 1c LLM");
  }

  return response.output_parsed as unknown as Call1cOutput;
}

/**
 * Run Call 2: Tags + Prayer Suggestions
 * Extracts structured tags and suggests prayer requests
 */
export async function runTagsAndSuggestions(params: {
  entryText: string;
  call1Summary: string;
}): Promise<Call2Output> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userMessage = buildCall2UserMessage({
    entryText: params.entryText,
    call1Summary: params.call1Summary,
  });

  const response = await openai.responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: JOURNAL_CALL2_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    text: {
      format: {
        type: "json_schema",
        name: JOURNAL_CALL2_SCHEMA.name,
        strict: true,
        schema: JOURNAL_CALL2_SCHEMA.schema,
      },
    },
    reasoning: { effort: "low" },
  });

  if (!response.output_parsed) {
    throw new Error("No response from Call 2 LLM");
  }

  return response.output_parsed as unknown as Call2Output;
}

/**
 * Get recent entry summaries for context in Call 1a
 */
export async function getRecentEntrySummaries(
  authorProfileId: string,
  limit: number
): Promise<string[]> {
  try {
    const recentEntries = await prisma.journalEntry.findMany({
      where: { authorProfileId },
      orderBy: { entryDate: "desc" },
      take: limit,
      include: {
        aiOutput: {
          select: { call1: true },
        },
      },
    });

    return recentEntries
      .map((entry) => {
        const call1 = entry.aiOutput?.call1 as Call1Output | null;
        return call1?.oneSentenceSummary || null;
      })
      .filter((summary): summary is string => summary !== null);
  } catch {
    // Table might not exist yet during migration
    return [];
  }
}

/**
 * Store final AI output after all calls complete
 * Includes automatic retry with exponential backoff for transient errors
 */
export async function storeJournalAIOutput(params: {
  entryId: string;
  call1: Call1Output;
  call2: Call2Output;
}): Promise<void> {
  const { entryId, call1, call2 } = params;
  const flatTags = flattenTags(call2.tags);

  // Retry configuration
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$transaction([
    prisma.journalEntryAI.upsert({
      where: { entryId },
      create: {
        entryId,
        call1: call1 as object,
        call2: call2 as object,
        modelInfo: {
          model: MODEL,
          version: "1.0",
          promptVersion: PROMPT_VERSION,
        },
      },
      update: {
        call1: call1 as object,
        call2: call2 as object,
        modelInfo: {
          model: MODEL,
          version: "1.0",
          promptVersion: PROMPT_VERSION,
        },
      },
    }),
    prisma.journalEntry.update({
      where: { id: entryId },
      data: { tags: flatTags },
    }),
      ]);
      // Success - exit retry loop
      return;
    } catch (error: any) {
      // Check if it's a transaction timeout (P2028)
      if (error.code === "P2028" && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Transaction timeout (P2028), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      // If not P2028 or max retries reached, rethrow
      throw error;
    }
  }
}

/**
 * Get user's preferred response depth from profile
 */
export async function getPreferredDepth(
  authorProfileId: string
): Promise<"concise" | "moderate" | "detailed"> {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { id: authorProfileId },
      select: { preferredDepth: true },
    });

    const depth = profile?.preferredDepth;
    if (depth === "concise" || depth === "moderate" || depth === "detailed") {
      return depth;
    }
    return "concise";
  } catch {
    return "concise";
  }
}
