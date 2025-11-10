// utils/memoryExtraction.ts
// Background memory extraction from conversations

import OpenAI from "openai";
import { updateUserProfile, getUserProfile, type UserProfileMemory } from "@/lib/langGraphStore";
import { MEMORY_EXTRACTION_SYS_PROMPT, MERGE_MEMORIES_SYS_PROMPT, extractionSchema, mergeSchema } from "@/lib/prompts/memory";

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
    [category: string]: number;
  };
  preferences?: {
    denomination?: string;
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
 * Main function: Extract and update user memories from conversation
 * This runs in the background after conversations complete
 * 
 * @param userId - The user's ID
 * @param messages - Recent conversation messages (typically last exchange)
 * @param metadata - Optional metadata (category, subcategory, etc.)
 */
export async function updateUserMemoriesFromConversation(
  userId: string,
  messages: ConversationMessage[],
  metadata?: {
    category?: string;
    subcategory?: string;
    denomination?: string;
  }
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

    // Add metadata to extracted memories if provided
    if (metadata?.category && extracted.questionPatterns) {
      extracted.questionPatterns[metadata.category] =
        (extracted.questionPatterns[metadata.category] || 0) + 1;
    }

    if (metadata?.denomination && !extracted.preferences?.denomination) {
      if (!extracted.preferences) extracted.preferences = {};
      extracted.preferences.denomination = metadata.denomination;
    }

    // Step 2: Merge with existing profile
    const mergedProfile = await mergeMemories(userId, extracted);

    // Step 3: Update store
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
