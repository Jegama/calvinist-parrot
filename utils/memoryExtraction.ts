// utils/memoryExtraction.ts
// Background memory extraction from conversations

import OpenAI from "openai";
import { updateUserProfile, getUserProfile, type UserProfileMemory } from "@/lib/langGraphStore";
import { MEMORY_EXTRACTION_SYS_PROMPT, MERGE_MEMORIES_SYS_PROMPT, extractionSchema, mergeSchema } from "@/lib/prompts/memory";
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
      count: number;
      contexts: string[];
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
    status?: "seeker" | "new_believer" | "mature_believer" | "unclear";
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
    .map(m => `${m.sender === 'user' ? 'User' : 'Parrot'}: ${m.content}`)
    .join('\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: MEMORY_EXTRACTION_SYS_PROMPT },
        { role: "user", content: conversationText }
      ],
      response_format: { type: "json_schema", json_schema: extractionSchema },
      temperature: 0.3, // Lower temperature for more consistent extraction
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
  // Get existing profile
  const existingProfile = await getUserProfile(userId) || {
    userId,
    theologicalInterests: {},
    personalContext: {},
    questionPatterns: {},
    lastUpdated: new Date().toISOString(),
  };

  try {
    const response = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: MERGE_MEMORIES_SYS_PROMPT },
        {
          role: "user",
          content: `Existing profile:\n${JSON.stringify(existingProfile, null, 2)}\n\nNew memories:\n${JSON.stringify(newMemories, null, 2)}`
        }
      ],
      response_format: { type: "json_schema", json_schema: mergeSchema },
      temperature: 0.3,
    });

    const merged = JSON.parse(response.choices[0].message.content || "{}");

    // Ensure required fields
    return {
      userId,
      theologicalInterests: merged.theologicalInterests || existingProfile.theologicalInterests,
      personalContext: merged.personalContext || existingProfile.personalContext,
      questionPatterns: merged.questionPatterns || existingProfile.questionPatterns,
      preferences: merged.preferences || existingProfile.preferences,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error merging memories:", error);
    // Return existing profile with updated timestamp on error
    return {
      ...existingProfile,
      lastUpdated: new Date().toISOString(),
    };
  }
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
      updateData.coreDoctrineQuestions = { increment: extracted.questionPatterns.coreDoctrineQuestions };
    }
    if (extracted.questionPatterns?.secondaryDoctrineQuestions) {
      updateData.secondaryDoctrineQuestions = { increment: extracted.questionPatterns.secondaryDoctrineQuestions };
    }
    if (extracted.questionPatterns?.tertiaryDoctrineQuestions) {
      updateData.tertiaryDoctrineQuestions = { increment: extracted.questionPatterns.tertiaryDoctrineQuestions };
    }

    // Ministry context
    if (extracted.ministryContext && extracted.ministryContext.length > 0) {
      // Merge with existing (deduplicate)
      const existing = await prisma.userProfile.findUnique({
        where: { appwriteUserId: userId },
        select: { ministryContext: true }
      });
      const combined = [...new Set([...(existing?.ministryContext || []), ...extracted.ministryContext])];
      updateData.ministryContext = combined;
    }

    // Church involvement
    if (extracted.churchInvolvement) {
      updateData.churchInvolvement = extracted.churchInvolvement;
    }

    // Learning preferences
    if (extracted.learningPreferences?.followUpTendency) {
      updateData.followUpTendency = extracted.learningPreferences.followUpTendency;
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
      if (updateData.spiritualStatus) createData.spiritualStatus = updateData.spiritualStatus;
      if (updateData.gospelPresentedAt) createData.gospelPresentedAt = updateData.gospelPresentedAt;
      if (updateData.gospelPresentationCount) createData.gospelPresentationCount = updateData.gospelPresentationCount.increment;
      if (updateData.coreDoctrineQuestions) createData.coreDoctrineQuestions = updateData.coreDoctrineQuestions.increment;
      if (updateData.secondaryDoctrineQuestions) createData.secondaryDoctrineQuestions = updateData.secondaryDoctrineQuestions.increment;
      if (updateData.tertiaryDoctrineQuestions) createData.tertiaryDoctrineQuestions = updateData.tertiaryDoctrineQuestions.increment;
      if (updateData.ministryContext) createData.ministryContext = updateData.ministryContext;
      if (updateData.churchInvolvement) createData.churchInvolvement = updateData.churchInvolvement;
      if (updateData.followUpTendency) createData.followUpTendency = updateData.followUpTendency;
      if (updateData.preferredDepth) createData.preferredDepth = updateData.preferredDepth;

      await prisma.userProfile.upsert({
        where: { appwriteUserId: userId },
        update: updateData,
        create: createData,
      });
      console.log(`✅ Synced ${Object.keys(updateData).length} fields to Prisma for user ${userId}`);
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
  messages: ConversationMessage[],
): Promise<void> {
  try {
    // Validate userId
    if (!userId || userId === 'undefined' || userId === 'null') {
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
    const patterns = existing?.questionPatterns || {};

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

    // Update question pattern
    patterns[category] = (patterns[category] || 0) + 1;

    await updateUserProfile(userId, {
      userId,
      theologicalInterests: interests,
      questionPatterns: patterns,
      personalContext: existing?.personalContext || {},
      lastUpdated: new Date().toISOString(),
    });

    console.log(`✅ Simple memory update for ${userId}: ${topic}`);
  } catch (error) {
    console.error("Error in simple memory update:", error);
  }
}
