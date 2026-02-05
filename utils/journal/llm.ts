// utils/journal/llm.ts
// AI pipeline for Personal Journal (Phase 2)
// Handles pastoral reflection (Call 1a/1b/1c) and tags/suggestions (Call 2)
// Uses parallel execution for faster UX

import { createHash } from "crypto";
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
  JOURNAL_CALL1A_SYSTEM_PROMPT,
  JOURNAL_CALL1A_USER_TEMPLATE,
  JOURNAL_CALL1B_SYSTEM_PROMPT,
  JOURNAL_CALL1B_USER_TEMPLATE,
  JOURNAL_CALL1C_SYSTEM_PROMPT,
  JOURNAL_CALL1C_USER_TEMPLATE,
  JOURNAL_CALL2_SYSTEM_PROMPT,
  JOURNAL_CALL2_USER_TEMPLATE,
  buildCall2UserMessage,
  flattenTags,
  type RecentEntryContext,
} from "@/lib/prompts/journal";

const MODEL = "gpt-5-mini";
const LARGER_MODEL = "gpt-5.2-2025-12-11";

const PROMPT_HASH = createHash("sha256")
  .update(JOURNAL_CALL1A_SYSTEM_PROMPT)
  .update(JOURNAL_CALL1A_USER_TEMPLATE)
  .update(JOURNAL_CALL1B_SYSTEM_PROMPT)
  .update(JOURNAL_CALL1B_USER_TEMPLATE)
  .update(JOURNAL_CALL1C_SYSTEM_PROMPT)
  .update(JOURNAL_CALL1C_USER_TEMPLATE)
  .update(JOURNAL_CALL2_SYSTEM_PROMPT)
  .update(JOURNAL_CALL2_USER_TEMPLATE)
  .digest("hex")
  .slice(0, 8);
const PROMPT_VERSION = `1.0.0-${PROMPT_HASH}`;

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const JOURNAL_LARGER_MODEL_MIN_WORDS = (() => {
  const raw = process.env.JOURNAL_LARGER_MODEL_MIN_WORDS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
})();

function selectJournalReasoningModel(entryText: string): string {
  return countWords(entryText) >= JOURNAL_LARGER_MODEL_MIN_WORDS ? LARGER_MODEL : MODEL;
}

// ===========================================
// Runtime Type Guards
// ===========================================

function isCall1aOutput(value: unknown): value is Call1aOutput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    typeof v.oneSentenceSummary === "string" &&
    typeof v.situationSummary === "string"
  );
}

function isCall1bOutput(value: unknown): value is Call1bOutput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.heartReflection) &&
    Array.isArray(v.putOffPutOn)
  );
}

function isCall1cOutput(value: unknown): value is Call1cOutput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.scripture) &&
    Array.isArray(v.practicalNextSteps) &&
    Array.isArray(v.safetyFlags)
  );
}

function isCall2Output(value: unknown): value is Call2Output {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tags === "object" &&
    v.tags !== null &&
    Array.isArray(v.suggestedPrayerRequests) &&
    typeof v.dashboardSignals === "object" &&
    v.dashboardSignals !== null
  );
}

// ===========================================
// Default outputs for partial-result handling
// ===========================================

export const DEFAULT_CALL1B: Call1bOutput = {
  heartReflection: [],
  putOffPutOn: [],
};

export const DEFAULT_CALL1C: Call1cOutput = {
  scripture: [],
  practicalNextSteps: [],
  safetyFlags: [],
};

export const DEFAULT_CALL2: Call2Output = {
  tags: {
    circumstance: [],
    heartIssue: [],
    rulingDesire: [],
    virtue: [],
    theologicalTheme: [],
    meansOfGrace: [],
  },
  suggestedPrayerRequests: [],
  dashboardSignals: { recurringTheme: null },
};

/**
 * Run Call 1a: Quick Overview (title, summary, situation)
 * This is the fast first paint - runs first to get summary for other calls
 */
export async function runCall1a(params: {
  entryText: string;
}): Promise<Call1aOutput> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildCall1SystemPrompt("a");
  const userMessage = buildCall1aUserMessage({
    entryText: params.entryText,
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

  if (!isCall1aOutput(response.output_parsed)) {
    throw new Error("Invalid Call 1a response structure");
  }

  return response.output_parsed;
}

/**
 * Run Call 1b: Heart Analysis (heartReflection, putOffPutOn)
 */
export async function runCall1b(params: {
  entryText: string;
  situationSummary: string;
  recentContext?: RecentEntryContext;
}): Promise<{ output: Call1bOutput; model: string }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildCall1SystemPrompt("b");
  const userMessage = buildCall1bUserMessage({
    entryText: params.entryText,
    situationSummary: params.situationSummary,
    recentContext: params.recentContext,
  });
  const model = selectJournalReasoningModel(params.entryText);

  const response = await openai.responses.parse({
    model,
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

  if (!isCall1bOutput(response.output_parsed)) {
    throw new Error("Invalid Call 1b response structure");
  }

  return { output: response.output_parsed, model };
}

/**
 * Run Call 1c: Biblical Guidance (scripture, practicalNextSteps, safetyFlags)
 */
export async function runCall1c(params: {
  entryText: string;
  situationSummary: string;
  recentContext?: RecentEntryContext;
}): Promise<{ output: Call1cOutput; model: string }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildCall1SystemPrompt("c");
  const userMessage = buildCall1cUserMessage({
    entryText: params.entryText,
    situationSummary: params.situationSummary,
    recentContext: params.recentContext,
  });
  const model = selectJournalReasoningModel(params.entryText);

  const response = await openai.responses.parse({
    model,
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

  if (!isCall1cOutput(response.output_parsed)) {
    throw new Error("Invalid Call 1c response structure");
  }

  return { output: response.output_parsed, model };
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

  if (!isCall2Output(response.output_parsed)) {
    throw new Error("Invalid Call 2 response structure");
  }

  return response.output_parsed;
}

// Re-export RecentEntryContext from prompts for convenience
export type { RecentEntryContext };

/**
 * Get rich context from recent journal entries for Call 1b and 1c
 * Includes situation summaries with dates and recurring themes for better pattern recognition
 */
export async function getRecentEntryContext(
  authorProfileId: string,
  limit: number
): Promise<RecentEntryContext> {
  try {
    // Fetch only PERSONAL journal entries (excludes DISCIPLESHIP entries)
    const recentEntries = await prisma.journalEntry.findMany({
      where: {
        authorProfileId,
        entryType: "PERSONAL", // Only Personal Journal entries, not Kids Discipleship
        aiOutput: {
          isNot: null, // Only get entries that have been processed
        }
      },
      orderBy: { entryDate: "desc" },
      take: limit,
      include: {
        aiOutput: {
          select: { call1: true, call2: true },
        },
      },
    });

    const summaries: string[] = [];
    const themeCounts = new Map<string, number>();

    for (const entry of recentEntries) {
      // Extract situationSummary with formatted date (all entries should have this since we filtered by entryType)
      const call1 = entry.aiOutput?.call1 as Call1Output | null;
      if (call1?.situationSummary) {
        const date = new Date(entry.entryDate);
        const formattedDate = date.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        summaries.push(`${formattedDate}: ${call1.situationSummary}`);
      }

      // Extract themes and count occurrences
      const call2 = entry.aiOutput?.call2 as Call2Output | null;
      if (call2?.dashboardSignals?.recurringTheme) {
        const theme = call2.dashboardSignals.recurringTheme;
        themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
      }
    }

    // Get all themes sorted by frequency (most common first)
    const recurringThemes = [...themeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([theme]) => theme);

    return { summaries, recurringThemes };
  } catch (error) {
    console.warn("Failed to fetch recent entry context:", error);
    return { summaries: [], recurringThemes: [] };
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
  models: {
    call1bModel: string;
    call1cModel: string;
  };
}): Promise<void> {
  const { entryId, call1, call2 } = params;
  const flatTags = flattenTags(call2.tags);

  const modelInfo = {
    call1aModel: MODEL,
    call1bModel: params.models.call1bModel,
    call1cModel: params.models.call1cModel,
    call2Model: MODEL,
    promptVersion: PROMPT_VERSION,
  };

  // Retry configuration
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const existingEntry = await tx.journalEntry.findUnique({
          where: { id: entryId },
          select: { tags: true },
        });

        if (!existingEntry) {
          throw new Error("Journal entry not found when storing AI output");
        }

        const mergedTags = Array.from(new Set([...(existingEntry.tags || []), ...flatTags]));

        await tx.journalEntryAI.upsert({
          where: { entryId },
          create: {
            entryId,
            call1: call1 as object,
            call2: call2 as object,
            modelInfo,
          },
          update: {
            call1: call1 as object,
            call2: call2 as object,
            modelInfo,
          },
        });

        await tx.journalEntry.update({
          where: { id: entryId },
          data: { tags: mergedTags },
        });
      });
      // Success - exit retry loop
      return;
    } catch (error: unknown) {
      // Check if it's a transaction timeout (P2028)
      const prismaError = error as { code?: string };
      if (prismaError.code === "P2028" && attempt < maxRetries) {
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
