// utils/memoryExtraction.ts
// Background memory extraction from conversations

import OpenAI from "openai";
import {
  updateUserProfile,
  getUserProfile,
  type UserProfileMemory,
} from "@/lib/langGraphStore";
import {
  MEMORY_EXTRACTION_SYS_PROMPT,
  extractionSchema,
} from "@/lib/prompts/memory";
import prisma from "@/lib/prisma";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EXTRACTION_MODEL = "gpt-4.1-mini"; // Fast and cost-effective for extraction

interface ConversationMessage {
  sender: string;
  content: string;
}

interface ExtractedMemories {
  theologicalInterests?: {
    [topic: string]: {
      count?: number;
      contexts?: string[];
    };
  };
  personalContext?: {
    lifeStage?: string;
    concerns?: string[];
    spiritualJourney?: string[];
  };
  questionPatterns?: {
    coreDoctrineQuestions?: number;
    secondaryDoctrineQuestions?: number;
    tertiaryDoctrineQuestions?: number;
  };
  spiritualStatus?: {
    status?:
      | "seeker"
      | "new_believer"
      | "growing_believer"
      | "mature_believer"
      | "unclear";
    gospelPresented?: boolean;
  };
  ministryContext?: string[];
  churchInvolvement?: "active_member" | "seeking_church" | "unclear";
  learningPreferences?: {
    followUpTendency?: "deep_diver" | "quick_mover" | "balanced";
    preferredDepth?: "concise" | "moderate" | "detailed";
  };
  preferences?: {
    preferredTopics?: string[];
  };
}

/**
 * Extract memories from a conversation using LLM
 * This identifies theological topics, personal context, and question patterns
 */
async function extractMemoriesFromConversation(
  messages: ConversationMessage[]
): Promise<ExtractedMemories> {
  const conversationText = messages
    .map((m) => `${m.sender === "user" ? "User" : "Parrot"}: ${m.content}`)
    .join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: MEMORY_EXTRACTION_SYS_PROMPT },
        { role: "user", content: conversationText },
      ],
      response_format: { type: "json_schema", json_schema: extractionSchema },
      temperature: 0.1, // Lower temperature for more consistent extraction
    });

    const extracted = JSON.parse(response.choices[0].message.content || "{}");
    return extracted;
  } catch (error) {
    console.error("Error extracting memories:", error);
    return {};
  }
}

/**
 * Merge extracted memories with existing user profile
 * Uses LLM to intelligently combine new and old information
 */
async function mergeMemories(
  userId: string,
  newMemories: ExtractedMemories
): Promise<UserProfileMemory> {
  const existingProfile: UserProfileMemory = (await getUserProfile(userId)) || {
    userId,
    theologicalInterests: {},
    personalContext: {},
    lastUpdated: new Date().toISOString(),
  };

  const nowIso = new Date().toISOString();

  const clampUnique = (arr: string[] = [], max: number) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of arr) {
      const key = String(item).trim();
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(key);
      }
      if (result.length >= max) break;
    }
    return result;
  };

  // Canonicalize topic keys to snake_case and strip punctuation/spaces
  const canonicalizeTopic = (s: string) =>
    String(s)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u2018\u2019\u201C\u201D'"`]/g, "") // smart quotes + quotes
      .replace(/[^a-z0-9]+/g, "_") // non-alphanum -> underscore
      .replace(/^_+|_+$/g, "") // trim underscores
      .replace(/_{2,}/g, "_"); // collapse repeats

  // Normalize variants
  const normalizedNew = { ...newMemories };
  if (normalizedNew.theologicalInterests) {
    for (const [topic, info] of Object.entries(
      normalizedNew.theologicalInterests
    )) {
      // Support model variant keys
      // @ts-expect-error allow mentions alias
      const altCount = info.mentions as number | undefined;
      // @ts-expect-error allow keyContext alias
      const altContexts = info.keyContext as string[] | undefined;
      if (altCount !== undefined && info.count === undefined)
        info.count = altCount;
      if (altContexts && (!info.contexts || info.contexts.length === 0))
        info.contexts = altContexts;
      if (Array.isArray(info.contexts))
        info.contexts = info.contexts.map((c) => String(c));
    }

    // Canonicalize and merge duplicate keys
    const canonicalMap: NonNullable<ExtractedMemories["theologicalInterests"]> =
      {};
    for (const [rawKey, info] of Object.entries(
      normalizedNew.theologicalInterests
    )) {
      const key = canonicalizeTopic(rawKey);
      if (!key) continue;
      const target = (canonicalMap[key] ||= { count: 0, contexts: [] });
      const addCount = Math.max(0, Number(info?.count ?? 1));
      target.count = Math.max(0, Number(target.count ?? 0)) + addCount;
      const ctx = Array.isArray(info?.contexts)
        ? info!.contexts!.map((c) => String(c)).filter(Boolean)
        : [];
      target.contexts = [...(target.contexts || []), ...ctx];
    }
    normalizedNew.theologicalInterests = canonicalMap;
  }

  // Start with existing interests but canonicalize keys and merge duplicates
  const interests: {
    [topic: string]: {
      count: number;
      lastMentioned: string;
      contexts: string[];
    };
  } = {};
  for (const [rawKey, data] of Object.entries(
    existingProfile.theologicalInterests || {}
  )) {
    const key = canonicalizeTopic(rawKey);
    if (!key) continue;
    if (!interests[key]) {
      interests[key] = {
        count: Math.max(0, Number((data as any)?.count ?? 0)),
        lastMentioned: String((data as any)?.lastMentioned || nowIso),
        contexts: Array.isArray((data as any)?.contexts)
          ? ((data as any)?.contexts as string[]).map((c) => String(c))
          : [],
      };
    } else {
      // merge duplicate existing keys
      interests[key].count += Math.max(0, Number((data as any)?.count ?? 0));
      const existingTime = Date.parse(interests[key].lastMentioned || "0");
      const candidateTime = Date.parse(
        String((data as any)?.lastMentioned || "0")
      );
      if (candidateTime > existingTime) {
        interests[key].lastMentioned = String((data as any)?.lastMentioned);
      }
      const merged = [
        ...interests[key].contexts,
        ...(Array.isArray((data as any)?.contexts)
          ? ((data as any)?.contexts as string[])
          : []
        ).map((c) => String(c)),
      ];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const c of merged) {
        const t = c.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
      }
      interests[key].contexts = out;
    }
  }
  const MAX_CONTEXTS_PER_TOPIC = 5;
  const MAX_TOTAL_TOPICS = 40; // global cap to prevent unbounded growth
  if (normalizedNew.theologicalInterests) {
    for (const [topic, info] of Object.entries(
      normalizedNew.theologicalInterests
    )) {
      const newCount = Math.max(0, Number(info?.count ?? 1));
      const newContexts = Array.isArray(info?.contexts)
        ? info!.contexts!.map((c) => String(c)).filter(Boolean)
        : [];
      if (!interests[topic]) {
        interests[topic] = { count: 0, lastMentioned: nowIso, contexts: [] };
      }
      interests[topic].count += newCount;
      interests[topic].lastMentioned = nowIso;
      const mergedContexts = [
        ...newContexts.slice(-MAX_CONTEXTS_PER_TOPIC),
        ...(interests[topic].contexts || []),
      ];
      // Deduplicate preserving order, clamp
      const unique: string[] = [];
      const seenCtx = new Set<string>();
      for (const c of mergedContexts) {
        const trimmed = c.trim();
        if (!trimmed) continue;
        if (!seenCtx.has(trimmed)) {
          seenCtx.add(trimmed);
          unique.push(trimmed);
        }
        if (unique.length >= MAX_CONTEXTS_PER_TOPIC) break;
      }
      interests[topic].contexts = unique;
    }
  }

  // If total topics exceed cap, keep highest count & most recently mentioned
  const topicEntries = Object.entries(interests);
  if (topicEntries.length > MAX_TOTAL_TOPICS) {
    topicEntries.sort((a, b) => {
      const countDiff = b[1].count - a[1].count;
      if (countDiff !== 0) return countDiff;
      // newer lastMentioned first
      return Date.parse(b[1].lastMentioned) - Date.parse(a[1].lastMentioned);
    });
    const trimmed = topicEntries.slice(0, MAX_TOTAL_TOPICS);
    const newMap: typeof interests = {};
    for (const [k, v] of trimmed) newMap[k] = v;
    // Drop less significant topics
    for (const k of Object.keys(interests)) {
      if (!newMap[k]) delete interests[k];
    }
  }

  // Merge personal context
  const existingPc = existingProfile.personalContext || {};
  const newPc = normalizedNew.personalContext || {};
  const MAX_CONCERNS = 50;
  const MAX_JOURNEY = 50;
  const concerns = clampUnique(
    [
      ...(newPc.concerns || []).map((c) => String(c)).filter(Boolean),
      ...(existingPc.concerns || []).map((c) => String(c)).filter(Boolean),
    ],
    MAX_CONCERNS
  );
  const journey = clampUnique(
    [
      ...(newPc.spiritualJourney || []).map((c) => String(c)).filter(Boolean),
      ...(existingPc.spiritualJourney || [])
        .map((c) => String(c))
        .filter(Boolean),
    ],
    MAX_JOURNEY
  );
  const lifeStage = newPc.lifeStage || existingPc.lifeStage;

  // Merge preferences
  const existingPref = existingProfile.preferences || {};
  const newPref = normalizedNew.preferences || {};
  const MAX_PREF_TOPICS = 30;
  const preferredTopics = clampUnique(
    [
      ...(newPref.preferredTopics || []).map((t) => String(t)).filter(Boolean),
      ...(existingPref.preferredTopics || [])
        .map((t) => String(t))
        .filter(Boolean),
    ],
    MAX_PREF_TOPICS
  );

  return {
    userId: existingProfile.userId,
    theologicalInterests: interests,
    personalContext: {
      ...existingPc,
      lifeStage,
      concerns,
      spiritualJourney: journey,
    },
    preferences:
      preferredTopics.length > 0 ? { preferredTopics } : existingPref,
    lastUpdated: nowIso,
  };
}

/**
 * Sync extracted memory data to Prisma userProfile table
 * This updates spiritual status, doctrinal question counts, ministry context, and learning preferences
 */
async function syncToPrisma(
  userId: string,
  extracted: ExtractedMemories
): Promise<void> {
  try {
    const updateData: {
      spiritualStatus?: string;
      gospelPresentedAt?: Date;
      gospelPresentationCount?: { increment: number };
      coreDoctrineQuestions?: { increment: number };
      secondaryDoctrineQuestions?: { increment: number };
      tertiaryDoctrineQuestions?: { increment: number };
      ministryContext?: string[];
      churchInvolvement?: string;
      followUpTendency?: string;
      preferredDepth?: string;
    } = {};

    // Spiritual status (PRIVATE)
    if (extracted.spiritualStatus?.status) {
      updateData.spiritualStatus = extracted.spiritualStatus.status;
    }
    if (extracted.spiritualStatus?.gospelPresented) {
      updateData.gospelPresentedAt = new Date();
      updateData.gospelPresentationCount = { increment: 1 };
    }

    // Doctrinal question tracking
    if (extracted.questionPatterns?.coreDoctrineQuestions) {
      updateData.coreDoctrineQuestions = {
        increment: extracted.questionPatterns.coreDoctrineQuestions,
      };
    }
    if (extracted.questionPatterns?.secondaryDoctrineQuestions) {
      updateData.secondaryDoctrineQuestions = {
        increment: extracted.questionPatterns.secondaryDoctrineQuestions,
      };
    }
    if (extracted.questionPatterns?.tertiaryDoctrineQuestions) {
      updateData.tertiaryDoctrineQuestions = {
        increment: extracted.questionPatterns.tertiaryDoctrineQuestions,
      };
    }

    // Ministry context
    if (extracted.ministryContext && extracted.ministryContext.length > 0) {
      // Merge with existing (deduplicate)
      const existing = await prisma.userProfile.findUnique({
        where: { appwriteUserId: userId },
        select: { ministryContext: true },
      });
      const combined = [
        ...new Set([
          ...(existing?.ministryContext || []),
          ...extracted.ministryContext,
        ]),
      ];
      updateData.ministryContext = combined;
    }

    // Church involvement
    if (extracted.churchInvolvement) {
      updateData.churchInvolvement = extracted.churchInvolvement;
    }

    // Learning preferences
    if (extracted.learningPreferences?.followUpTendency) {
      updateData.followUpTendency =
        extracted.learningPreferences.followUpTendency;
    }
    if (extracted.learningPreferences?.preferredDepth) {
      updateData.preferredDepth = extracted.learningPreferences.preferredDepth;
    }

    // Only update if we have data
    if (Object.keys(updateData).length > 0) {
      // Build create data (converts increments to initial values)
      const createData: {
        appwriteUserId: string;
        displayName: string;
        spiritualStatus?: string;
        gospelPresentedAt?: Date;
        gospelPresentationCount?: number;
        coreDoctrineQuestions?: number;
        secondaryDoctrineQuestions?: number;
        tertiaryDoctrineQuestions?: number;
        ministryContext?: string[];
        churchInvolvement?: string;
        followUpTendency?: string;
        preferredDepth?: string;
      } = {
        appwriteUserId: userId,
        displayName: "User", // Will be updated by auth flow
      };

      // Convert increment operations to initial values for create
      if (updateData.spiritualStatus)
        createData.spiritualStatus = updateData.spiritualStatus;
      if (updateData.gospelPresentedAt)
        createData.gospelPresentedAt = updateData.gospelPresentedAt;
      if (updateData.gospelPresentationCount)
        createData.gospelPresentationCount =
          updateData.gospelPresentationCount.increment;
      if (updateData.coreDoctrineQuestions)
        createData.coreDoctrineQuestions =
          updateData.coreDoctrineQuestions.increment;
      if (updateData.secondaryDoctrineQuestions)
        createData.secondaryDoctrineQuestions =
          updateData.secondaryDoctrineQuestions.increment;
      if (updateData.tertiaryDoctrineQuestions)
        createData.tertiaryDoctrineQuestions =
          updateData.tertiaryDoctrineQuestions.increment;
      if (updateData.ministryContext)
        createData.ministryContext = updateData.ministryContext;
      if (updateData.churchInvolvement)
        createData.churchInvolvement = updateData.churchInvolvement;
      if (updateData.followUpTendency)
        createData.followUpTendency = updateData.followUpTendency;
      if (updateData.preferredDepth)
        createData.preferredDepth = updateData.preferredDepth;

      await prisma.userProfile.upsert({
        where: { appwriteUserId: userId },
        update: updateData,
        create: createData,
      });
      console.log(
        `✅ Synced ${
          Object.keys(updateData).length
        } fields to Prisma for user ${userId}`
      );
    }
  } catch (error) {
    console.error("Error syncing to Prisma:", error);
    // Don't throw - memory sync shouldn't break the app
  }
}

/**
 * Main function: Extract and update user memories from conversation
 * This runs in the background after conversations complete
 *
 * @param userId - The user's ID
 * @param messages - Recent conversation messages (typically last exchange)
 */
export async function updateUserMemoriesFromConversation(
  userId: string,
  messages: ConversationMessage[]
): Promise<void> {
  try {
    // Validate userId
    if (!userId || userId === "undefined" || userId === "null") {
      console.warn(`⚠️ Memory extraction skipped: invalid userId (${userId})`);
      return;
    }

    // Validate messages
    if (!messages || messages.length === 0) {
      console.warn(`⚠️ Memory extraction skipped: no messages to extract from`);
      return;
    }

    console.log(`🧠 Extracting memories for user ${userId}...`);

    // Step 1: Extract new memories from conversation
    const extracted = await extractMemoriesFromConversation(messages);

    // Step 2: Sync structured data to Prisma (spiritual status, doctrinal questions, ministry context, learning preferences)
    await syncToPrisma(userId, extracted);

    // Step 3: Merge with existing profile in JSON store (for unstructured data like interests)
    const mergedProfile = await mergeMemories(userId, extracted);

    // Step 4: Update JSON store
    await updateUserProfile(userId, mergedProfile);

    console.log(`✅ Memories updated for user ${userId}`);
  } catch (error) {
    // Log but don't throw - memory extraction shouldn't break the app
    console.error("Error updating user memories:", error);
  }
}

/**
 * Simpler version: Update memories without LLM merging
 * Faster but less intelligent - just increments counts
 */
export async function updateUserMemoriesSimple(
  userId: string,
  topic: string,
  category: string,
  context: string
): Promise<void> {
  try {
    const existing = await getUserProfile(userId);
    const interests = existing?.theologicalInterests || {};

    // Update theological interest
    if (!interests[topic]) {
      interests[topic] = { count: 0, lastMentioned: "", contexts: [] };
    }
    interests[topic].count += 1;
    interests[topic].lastMentioned = new Date().toISOString();
    interests[topic].contexts.push(context);
    // Keep only last 5 contexts
    if (interests[topic].contexts.length > 5) {
      interests[topic].contexts = interests[topic].contexts.slice(-5);
    }

    await updateUserProfile(userId, {
      userId,
      theologicalInterests: interests,
      personalContext: existing?.personalContext || {},
      lastUpdated: new Date().toISOString(),
    });

    console.log(`✅ Simple memory update for ${userId}: ${topic}`);
  } catch (error) {
    console.error("Error in simple memory update:", error);
  }
}
