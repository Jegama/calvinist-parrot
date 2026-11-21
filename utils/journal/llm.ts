// utils/journal/llm.ts
// AI pipeline for Personal Journal (Phase 2)
// Handles pastoral reflection (Call 1a/1b/1c) and tags/suggestions (Call 2)
// Uses parallel execution for faster UX

import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { parrotAI, JOURNAL_MODEL } from "@/lib/parrot-ai";
import type {
  Call1aOutput,
  Call1bOutput,
  Call1cOutput,
  Call1Output,
  Call2Output,
  PersistedJournalAIOutput,
  JournalGenerationStage,
} from "@/types/journal";
import { failedJournalStages } from "@/types/journal";
import { markUsageOperationComplete } from "@/lib/provider-usage";
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
  operationId: string;
  entryText: string;
}): Promise<{ output: Call1aOutput; model: string }> {
  const systemPrompt = buildCall1SystemPrompt("a");
  const userMessage = buildCall1aUserMessage({
    entryText: params.entryText,
  });

  const result = await parrotAI.generateStructured<Call1aOutput>({
    modelSpec: JOURNAL_MODEL,
    usage: { feature: "personal_journal", stage: "call1a", operationId: params.operationId },
    validate: isCall1aOutput,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    schema: JOURNAL_CALL1A_SCHEMA,
    thinking: "low",
  });

  return { output: result.data, model: result.model };
}

/**
 * Run Call 1b: Heart Analysis (heartReflection, putOffPutOn)
 */
export async function runCall1b(params: {
  operationId: string;
  entryText: string;
  situationSummary: string;
  recentContext?: RecentEntryContext;
}): Promise<{ output: Call1bOutput; model: string }> {
  const systemPrompt = buildCall1SystemPrompt("b");
  const userMessage = buildCall1bUserMessage({
    entryText: params.entryText,
    situationSummary: params.situationSummary,
    recentContext: params.recentContext,
  });
  const result = await parrotAI.generateStructured<Call1bOutput>({
    modelSpec: JOURNAL_MODEL,
    usage: { feature: "personal_journal", stage: "call1b", operationId: params.operationId },
    validate: isCall1bOutput,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    schema: JOURNAL_CALL1B_SCHEMA,
    thinking: "low",
  });

  return { output: result.data, model: result.model };
}

/**
 * Run Call 1c: Biblical Guidance (scripture, practicalNextSteps, safetyFlags)
 */
export async function runCall1c(params: {
  operationId: string;
  entryText: string;
  situationSummary: string;
  recentContext?: RecentEntryContext;
}): Promise<{ output: Call1cOutput; model: string }> {
  const systemPrompt = buildCall1SystemPrompt("c");
  const userMessage = buildCall1cUserMessage({
    entryText: params.entryText,
    situationSummary: params.situationSummary,
    recentContext: params.recentContext,
  });
  const result = await parrotAI.generateStructured<Call1cOutput>({
    modelSpec: JOURNAL_MODEL,
    usage: { feature: "personal_journal", stage: "call1c", operationId: params.operationId },
    validate: isCall1cOutput,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    schema: JOURNAL_CALL1C_SCHEMA,
    thinking: "low",
  });

  return { output: result.data, model: result.model };
}

/**
 * Run Call 2: Tags + Prayer Suggestions
 * Extracts structured tags and suggests prayer requests
 */
export async function runTagsAndSuggestions(params: {
  operationId: string;
  entryText: string;
  call1Summary: string;
}): Promise<{ output: Call2Output; model: string }> {
  const userMessage = buildCall2UserMessage({
    entryText: params.entryText,
    call1Summary: params.call1Summary,
  });

  const result = await parrotAI.generateStructured<Call2Output>({
    modelSpec: JOURNAL_MODEL,
    usage: { feature: "personal_journal", stage: "call2", operationId: params.operationId },
    validate: isCall2Output,
    messages: [
      { role: "system", content: JOURNAL_CALL2_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    schema: JOURNAL_CALL2_SCHEMA,
    thinking: "low",
  });

  return { output: result.data, model: result.model };
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

interface Stage<T> {
  output: T;
  model?: string;
}

type JournalStages = {
  call1a?: Stage<Call1aOutput>;
  call1b?: Stage<Call1bOutput>;
  call1c?: Stage<Call1cOutput>;
  call2?: Stage<Call2Output>;
};

/** Split the combined legacy reflection into just the fields each stage owns. */
export function readJournalStages(saved: PersistedJournalAIOutput): JournalStages {
  if (!saved) return {};
  const { call1, call2 } = saved;
  const failed = failedJournalStages(saved);
  const info = typeof saved.modelInfo === "object" && saved.modelInfo !== null
    ? saved.modelInfo as Record<string, unknown> : {};
  const modelFor = (stage: JournalGenerationStage) => {
    // Early entries stored a single model for the whole reflection.
    const model = info[`${stage}Model`] ?? info.model;
    return typeof model === "string" ? model : undefined;
  };

  const stages: JournalStages = {};
  if (!failed.has("call1a") && isCall1aOutput(call1)) {
    const { title, situationSummary, oneSentenceSummary } = call1;
    stages.call1a = { output: { title, situationSummary, oneSentenceSummary }, model: modelFor("call1a") };
  }
  if (!failed.has("call1b") && isCall1bOutput(call1)) {
    const { heartReflection, putOffPutOn } = call1;
    stages.call1b = { output: { heartReflection, putOffPutOn }, model: modelFor("call1b") };
  }
  if (!failed.has("call1c") && isCall1cOutput(call1)) {
    const { scripture, practicalNextSteps, safetyFlags } = call1;
    stages.call1c = { output: { scripture, practicalNextSteps, safetyFlags }, model: modelFor("call1c") };
  }
  if (!failed.has("call2") && isCall2Output(call2)) {
    stages.call2 = { output: call2, model: modelFor("call2") };
  }
  return stages;
}

export async function storeJournalAIOutput(entryId: string, results: JournalStages & { call1a: Stage<Call1aOutput> }) {
  const maxRetries = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const stored = await prisma.$transaction(async (tx) => {
        // Recoveries may finish concurrently. Merge with the most recently saved stages under the entry lock.
        const [entry] = await tx.$queryRaw<{ tags: string[] }[]>`
          SELECT tags FROM "journalEntry" WHERE id = ${entryId} FOR UPDATE
        `;
        if (!entry) throw new Error("Journal entry not found when storing AI output");
        const existing = await tx.journalEntryAI.findUnique({ where: { entryId } });
        const stages = { ...results, ...readJournalStages(existing) };

        const call1: Call1Output = {
          ...stages.call1a.output,
          ...(stages.call1b?.output ?? DEFAULT_CALL1B),
          ...(stages.call1c?.output ?? DEFAULT_CALL1C),
        };
        const call2 = stages.call2?.output ?? DEFAULT_CALL2;
        const failedStages: JournalGenerationStage[] = [];
        for (const stage of ["call1b", "call1c", "call2"] as const) {
          if (!stages[stage]) failedStages.push(stage);
        }
        const modelInfo = {
          call1aModel: stages.call1a.model ?? null,
          call1bModel: stages.call1b?.model ?? null,
          call1cModel: stages.call1c?.model ?? null,
          call2Model: stages.call2?.model ?? null,
          promptVersion: PROMPT_VERSION,
          status: failedStages.length ? "partial" : "complete",
          failedStages,
        };
        const data = { call1, call2, modelInfo };
        await tx.journalEntryAI.upsert({ where: { entryId }, create: { entryId, ...data }, update: data });
        const tags = Array.from(new Set([...entry.tags, ...flattenTags(call2.tags)]));
        await tx.journalEntry.update({ where: { id: entryId }, data: { tags } });
        return { call1, call2, failedStages, stages };
      });
      if (!stored.failedStages.length) await markUsageOperationComplete("personal_journal", entryId);
      return stored;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2028" || attempt >= maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
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
