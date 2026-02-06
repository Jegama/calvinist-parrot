// utils/kids-discipleship/llm.ts
// AI pipeline for Kids Discipleship (Heritage Journal) - Phase 3
// Handles parent shepherding reflection (Call 1) and tags/prayer suggestions (Call 2)

import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { parrotAI, DEFAULT_MODEL, LARGER_MODEL, type ModelSpec } from "@/lib/parrot-ai";
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
import type { LogCategory } from "@prisma/client";

const PROMPT_HASH = createHash("sha256")
  .update(KIDS_CALL1_SYSTEM_PROMPT)
  .update(KIDS_CALL1_USER_TEMPLATE)
  .update(KIDS_CALL2_SYSTEM_PROMPT)
  .update(KIDS_CALL2_USER_TEMPLATE)
  .digest("hex")
  .slice(0, 8);
const PROMPT_VERSION = `1.0.0-${PROMPT_HASH}`;

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const KIDS_LARGER_MODEL_MIN_WORDS = (() => {
  const raw = process.env.KIDS_LARGER_MODEL_MIN_WORDS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
})();

function selectKidsShepherdingModel(entryText: string): ModelSpec {
  return countWords(entryText) >= KIDS_LARGER_MODEL_MIN_WORDS ? LARGER_MODEL : DEFAULT_MODEL;
}

/**
 * Type guard to validate KidsCall1Output structure
 */
function isKidsCall1Output(value: unknown): value is KidsCall1Output {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.summary === "string" &&
    Array.isArray(v.whatMightBeGoingOnInTheHeart) &&
    typeof v.gospelConnectionSuggestion === "object" &&
    Array.isArray(v.parentShepherdingNextSteps) &&
    Array.isArray(v.scripture) &&
    typeof v.encouragementForParent === "string" &&
    Array.isArray(v.safetyFlags)
  );
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
  context: KidsPromptContext
): Promise<{ output: KidsCall1Output; model: string }> {
  const systemPrompt = buildKidsCall1SystemPrompt(context);
  const userMessage = buildKidsCall1UserMessage(context);
  const modelSpec = selectKidsShepherdingModel(context.entryText);

  const result = await parrotAI.generateStructured<KidsCall1Output>({
    modelSpec,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    schema: KIDS_CALL1_SCHEMA,
    thinking: "low",
  });

  if (!isKidsCall1Output(result.data)) {
    throw new Error("Invalid Kids Call 1 response structure");
  }

  return { output: result.data, model: result.model };
}

/**
 * Run Call 2: Tags + Child Prayer Suggestions
 * Extracts tags and suggests prayer topics for the child
 */
export async function runKidsCall2(
  context: KidsPromptContext & { call1Summary: string }
): Promise<KidsCall2Output> {
  const userMessage = buildKidsCall2UserMessage(context);

  const result = await parrotAI.generateStructured<KidsCall2Output>({
    messages: [
      { role: "system", content: KIDS_CALL2_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    schema: KIDS_CALL2_SCHEMA,
    thinking: "low",
  });

  if (!isKidsCall2Output(result.data)) {
    throw new Error("Invalid Kids Call 2 response structure");
  }

  return result.data;
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

/**
 * Store AI output for a kids discipleship log entry
 */
export async function storeKidsAIOutput(
  entryId: string,
  call1: KidsCall1Output,
  call2: KidsCall2Output,
  call1Model: string
): Promise<void> {
  const modelInfo = {
    call1Model,
    call2Model: DEFAULT_MODEL.model,
    promptVersion: PROMPT_VERSION,
  };
  await prisma.journalEntryAI.upsert({
    where: { entryId },
    create: {
      entryId,
      call1: JSON.parse(JSON.stringify(call1)),
      call2: JSON.parse(JSON.stringify(call2)),
      modelInfo,
    },
    update: {
      call1: JSON.parse(JSON.stringify(call1)),
      call2: JSON.parse(JSON.stringify(call2)),
      modelInfo,
    },
  });
}
