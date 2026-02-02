// utils/kids-discipleship/llm.ts
// AI pipeline for Kids Discipleship (Heritage Journal) - Phase 3
// Handles parent shepherding reflection (Call 1) and tags/prayer suggestions (Call 2)

import OpenAI from "openai";
import prisma from "@/lib/prisma";
import {
  type KidsCall1Output,
  type KidsCall2Output,
  type KidsPromptContext,
  buildKidsCall1SystemPrompt,
  buildKidsCall1UserMessage,
  buildKidsCall2UserMessage,
  KIDS_CALL2_SYSTEM_PROMPT,
} from "@/lib/prompts/kids-discipleship";
import {
  KIDS_CALL1_SCHEMA,
  KIDS_CALL2_SCHEMA,
} from "@/lib/schemas/kids-discipleship";
import {
  getAgeBracket,
  formatAge,
  AGE_BRACKET_CONFIG,
} from "@/utils/ageUtils";
import type { LogCategory } from "@prisma/client";

const MODEL = "gpt-5-mini";
const PROMPT_VERSION = "1.0.0";

export interface KidsLogContext {
  childId: string;
  childName: string;
  childBirthdate: Date | null;
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
  const birthdate = ctx.childBirthdate;
  let childAge = "Unknown age";
  let ageBracket = "Unknown bracket";

  if (birthdate) {
    childAge = formatAge(birthdate);
    const bracket = getAgeBracket(birthdate);
    if (bracket) {
      ageBracket = AGE_BRACKET_CONFIG[bracket].label;
    }
  }

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
): Promise<KidsCall1Output> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildKidsCall1SystemPrompt(context);
  const userMessage = buildKidsCall1UserMessage(context);

  const response = await openai.responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    text: {
      format: {
        type: "json_schema",
        name: KIDS_CALL1_SCHEMA.name,
        strict: true,
        schema: KIDS_CALL1_SCHEMA.schema,
      },
    },
    reasoning: { effort: "low" },
  });

  if (!response.output_parsed) {
    throw new Error("No response from Kids Call 1 LLM");
  }

  return response.output_parsed as unknown as KidsCall1Output;
}

/**
 * Run Call 2: Tags + Child Prayer Suggestions
 * Extracts tags and suggests prayer topics for the child
 */
export async function runKidsCall2(
  context: KidsPromptContext & { call1Summary: string }
): Promise<KidsCall2Output> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userMessage = buildKidsCall2UserMessage(context);

  const response = await openai.responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: KIDS_CALL2_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    text: {
      format: {
        type: "json_schema",
        name: KIDS_CALL2_SCHEMA.name,
        strict: true,
        schema: KIDS_CALL2_SCHEMA.schema,
      },
    },
    reasoning: { effort: "low" },
  });

  if (!response.output_parsed) {
    throw new Error("No response from Kids Call 2 LLM");
  }

  return response.output_parsed as unknown as KidsCall2Output;
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
  call2: KidsCall2Output
): Promise<void> {
  await prisma.journalEntryAI.upsert({
    where: { entryId },
    create: {
      entryId,
      call1: JSON.parse(JSON.stringify(call1)),
      call2: JSON.parse(JSON.stringify(call2)),
      modelInfo: {
        model: MODEL,
        version: "1.0",
        promptVersion: PROMPT_VERSION,
      },
    },
    update: {
      call1: JSON.parse(JSON.stringify(call1)),
      call2: JSON.parse(JSON.stringify(call2)),
      modelInfo: {
        model: MODEL,
        version: "1.0",
        promptVersion: PROMPT_VERSION,
      },
    },
  });
}
