// utils/kids-discipleship/llm.ts
// AI pipeline for Kids Discipleship (Heritage Journal) - Phase 3
// Handles parent shepherding reflection (Call 1) and tags/prayer suggestions (Call 2)

import { createHash } from "crypto";
import { markUsageOperationComplete } from "@/lib/provider-usage";
import prisma from "@/lib/prisma";
import { parrotAI, JOURNAL_MODEL } from "@/lib/parrot-ai";
import {
  type KidsCall1Output,
  type KidsCall2Output,
  type KidsPromptContext,
  buildKidsCall1SystemPrompt,
  buildKidsCall1UserMessage,
  buildKidsCall2UserMessage,
  KIDS_CALL1_SYSTEM_PROMPT,
  KIDS_CALL1_USER_TEMPLATE,
  KIDS_CALL2_SYSTEM_PROMPT,
  KIDS_CALL2_USER_TEMPLATE,
} from "@/lib/prompts/kids-discipleship";
import {
  KIDS_CALL1_SCHEMA,
  KIDS_CALL2_SCHEMA,
} from "@/lib/schemas/kids-discipleship";
import {
  getAgeBracket,
  formatAge,
  type AgeBracket,
} from "@/utils/ageUtils";
import { Prisma, type LogCategory } from "@prisma/client";
import { lockKidsLog } from "./lock-log";

const PROMPT_HASH = createHash("sha256")
  .update(KIDS_CALL1_SYSTEM_PROMPT)
  .update(KIDS_CALL1_USER_TEMPLATE)
  .update(KIDS_CALL2_SYSTEM_PROMPT)
  .update(KIDS_CALL2_USER_TEMPLATE)
  .digest("hex")
  .slice(0, 8);
const PROMPT_VERSION = `1.0.0-${PROMPT_HASH}`;

// Reflections saved before the recommended-reading feature have no resource list.
type StoredKidsCall1 = Omit<KidsCall1Output, "recommendedResources"> &
  Partial<Pick<KidsCall1Output, "recommendedResources">>;

function isStoredKidsCall1(value: unknown): value is StoredKidsCall1 {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.summary === "string" &&
    Array.isArray(v.whatMightBeGoingOnInTheHeart) &&
    typeof v.gospelConnectionSuggestion === "object" &&
    Array.isArray(v.parentShepherdingNextSteps) &&
    (v.recommendedResources === undefined || Array.isArray(v.recommendedResources)) &&
    Array.isArray(v.scripture) &&
    typeof v.encouragementForParent === "string" &&
    Array.isArray(v.safetyFlags)
  );
}

function isKidsCall1Output(value: unknown): value is KidsCall1Output {
  return isStoredKidsCall1(value) && Array.isArray(value.recommendedResources);
}

/**
 * Type guard to validate KidsCall2Output structure
 */
function isKidsCall2Output(value: unknown): value is KidsCall2Output {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tags === "object" &&
    v.tags !== null &&
    Array.isArray(v.suggestedChildPrayerRequests) &&
    Array.isArray(v.suggestedMonthlyVisionAdjustments)
  );
}

export interface KidsLogContext {
  childId: string;
  childName: string;
  childBirthdate: Date;
  category: LogCategory;
  entryText: string;
  gospelConnection: string | null;
  characterGoal: string | null;
  competencyGoal: string | null;
}

/**
 * Build the prompt context from a log's data
 */
export function buildPromptContext(ctx: KidsLogContext): KidsPromptContext {
  // Birthday is mandatory, so this should always exist.
  const childAge = formatAge(ctx.childBirthdate);

  const bracket = getAgeBracket(ctx.childBirthdate);
  if (!bracket) {
    // This should never happen if getAgeBracket is correct,
    // but throwing is better than silently degrading prompt quality.
    throw new Error("Kids discipleship: could not compute age bracket from birthdate");
  }

  const ageBracket: AgeBracket = bracket;

  return {
    childName: ctx.childName,
    childAge,
    ageBracket,
    characterGoal: ctx.characterGoal,
    competencyGoal: ctx.competencyGoal,
    category: ctx.category as "NURTURE" | "ADMONITION",
    entryText: ctx.entryText,
    gospelConnection: ctx.gospelConnection,
  };
}

/**
 * Run Call 1: Parent Shepherding Reflection
 * Provides pastoral guidance for the parenting moment
 */
export async function runKidsCall1(
  context: KidsPromptContext,
  operationId: string
): Promise<{ output: KidsCall1Output; model: string }> {
  const systemPrompt = buildKidsCall1SystemPrompt(context);
  const userMessage = buildKidsCall1UserMessage(context);

  const result = await parrotAI.generateStructured<KidsCall1Output>({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    schema: KIDS_CALL1_SCHEMA,
    modelSpec: JOURNAL_MODEL,
    usage: { feature: "heritage_journal", stage: "call1", operationId },
    validate: isKidsCall1Output,
    thinking: "low",
  });

  return { output: result.data, model: result.model };
}

/**
 * Run Call 2: Tags + Child Prayer Suggestions
 * Extracts tags and suggests prayer topics for the child
 */
export async function runKidsCall2(
  context: KidsPromptContext & { call1Summary: string },
  operationId: string
): Promise<{ output: KidsCall2Output; model: string }> {
  const userMessage = buildKidsCall2UserMessage(context);

  const result = await parrotAI.generateStructured<KidsCall2Output>({
    messages: [
      { role: "system", content: KIDS_CALL2_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    schema: KIDS_CALL2_SCHEMA,
    modelSpec: JOURNAL_MODEL,
    usage: { feature: "heritage_journal", stage: "call2", operationId },
    validate: isKidsCall2Output,
    thinking: "low",
  });

  return { output: result.data, model: result.model };
}

/**
 * Flatten tags from Call 2 output into a string array for storage
 */
export function flattenKidsTags(call2: KidsCall2Output): string[] {
  const tags: string[] = [];
  if (call2.tags.circumstance) tags.push(...call2.tags.circumstance);
  if (call2.tags.heartIssue) tags.push(...call2.tags.heartIssue);
  if (call2.tags.virtue) tags.push(...call2.tags.virtue);
  if (call2.tags.developmentalArea) tags.push(...call2.tags.developmentalArea);
  return tags;
}

/**
 * Get the current annual plan for a child (current year)
 */
export async function getCurrentAnnualPlan(memberId: string) {
  const currentYear = new Date().getFullYear();
  return prisma.discipleshipAnnualPlan.findUnique({
    where: {
      memberId_year: {
        memberId,
        year: currentYear,
      },
    },
  });
}

/**
 * Get the current monthly vision for a child (current month)
 */
export async function getCurrentMonthlyVision(memberId: string) {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return prisma.discipleshipMonthlyVision.findUnique({
    where: {
      memberId_yearMonth: {
        memberId,
        yearMonth,
      },
    },
  });
}

type SavedKidsReflection = {
  id: string;
  call1: unknown;
  call2: unknown;
  modelInfo: unknown;
};

function savedModel(modelInfo: unknown, stage: "call1Model" | "call2Model"): string {
  if (typeof modelInfo === "object" && modelInfo !== null) {
    const info = modelInfo as Record<string, unknown>;
    const model = info[stage] ?? info.model;
    if (typeof model === "string") return model;
  }
  return "unknown";
}

type HeritageEntry = { id: string; heritageOperationId: string | null };

async function lockHeritageRevision(tx: Prisma.TransactionClient, entry: HeritageEntry) {
  const log = await lockKidsLog(tx, entry.id);
  if (!log || log.heritageOperationId !== entry.heritageOperationId) {
    throw new Error("Heritage log changed during generation");
  }
}

// A concurrent request may have saved Call 1 while the provider was running.
async function checkpointKidsReflection(
  entry: HeritageEntry,
  generated: { output: KidsCall1Output; model: string },
) {
  const entryId = entry.id;
  return prisma.$transaction(async (tx) => {
    await lockHeritageRevision(tx, entry);
    const saved = await tx.journalEntryAI.findUnique({ where: { entryId } });
    if (saved && isStoredKidsCall1(saved.call1)) return { ...saved, call1: saved.call1 };

    const data = {
      call1: JSON.parse(JSON.stringify(generated.output)),
      modelInfo: { call1Model: generated.model, promptVersion: PROMPT_VERSION },
    };
    const checkpoint = await tx.journalEntryAI.upsert({
      where: { entryId },
      create: { entryId, ...data },
      update: { ...data, call2: Prisma.DbNull },
    });
    return { ...checkpoint, call1: generated.output };
  });
}

export async function storeKidsSuggestions(
  entry: HeritageEntry,
  checkpointId: string,
  suggestions: { output: KidsCall2Output; model: string },
) {
  return prisma.$transaction(async (tx) => {
    await lockHeritageRevision(tx, entry);
    // An edit deletes the checkpoint. A late result cannot recreate it or write
    // suggestions against a newer reflection, even if the parent reverted the edit.
    const saved = await tx.journalEntryAI.findUniqueOrThrow({ where: { id: checkpointId } });
    if (isKidsCall2Output(saved.call2)) return saved.call2;
    await tx.journalEntryAI.update({
      where: { id: checkpointId },
      data: {
        call2: JSON.parse(JSON.stringify(suggestions.output)),
        modelInfo: {
          call1Model: savedModel(saved.modelInfo, "call1Model"),
          call2Model: suggestions.model,
          promptVersion: PROMPT_VERSION,
        },
      },
    });
    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { tags: flattenKidsTags(suggestions.output) },
    });
    return suggestions.output;
  });
}

/** A retry shares the input revision's operation ID and only calls the provider for missing output. */
export async function generateKidsReflection(
  entry: HeritageEntry,
  context: KidsPromptContext,
  send: (event: Record<string, unknown>) => void,
  saved?: SavedKidsReflection | null
) {
  const operationId = entry.heritageOperationId ?? entry.id;
  let checkpoint;
  if (saved && isStoredKidsCall1(saved.call1)) {
    checkpoint = { ...saved, call1: saved.call1 };
  } else {
    send({ type: "progress", stage: "call1", message: "Generating shepherding reflection..." });
    const generated = await runKidsCall1(context, operationId);
    checkpoint = await checkpointKidsReflection(entry, generated);
  }
  const call1 = checkpoint.call1;
  send({ type: "call1_complete", call1 });

  let call2: KidsCall2Output;
  if (isKidsCall2Output(checkpoint.call2)) {
    call2 = checkpoint.call2;
  } else {
    send({ type: "progress", stage: "call2", message: "Analyzing tags and prayer suggestions..." });
    const suggestions = await runKidsCall2({ ...context, call1Summary: call1.summary }, operationId);
    call2 = await storeKidsSuggestions(entry, checkpoint.id, suggestions);
  }
  await markUsageOperationComplete("heritage_journal", operationId);
  send({ type: "call2_complete", call2 });
  return { call1, call2, tags: flattenKidsTags(call2) };
}
