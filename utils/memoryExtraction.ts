// utils/memoryExtraction.ts
// Background memory extraction from conversations

import OpenAI from "openai";
import { updateUserProfile, getUserProfile, type UserProfileMemory } from "@/lib/langGraphStore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EXTRACTION_MODEL = "gpt-4o-mini"; // Fast and cost-effective for extraction

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

  const systemPrompt = `You are a memory extraction assistant for a Reformed Christian chatbot.

Analyze the conversation and extract:

1. **Theological Interests**: Topics the user asked about (e.g., "eschatology", "predestination", "covenant theology")
   - For each topic, note: how many times mentioned, key context
   
2. **Personal Context**: Life situations mentioned (e.g., "married with kids", "facing grief", "new believer")
   - **lifeStage**: Family status, age group, life phase (e.g., "young parent", "retired", "college student")
   - **concerns**: Current struggles, questions, or challenges mentioned (e.g., "struggling with prayer", "doubts about assurance")
   - **spiritualJourney**: Growth areas, conversion story elements, spiritual milestones, areas of conviction or doubt
     * Examples: "recently converted", "growing in prayer life", "wrestling with Reformed soteriology", "convicted about family worship"
     * Include both struggles AND growth/victories
   
3. **Question Patterns**: Categorize the types of questions (e.g., "Reformed theology: 1", "Practical living: 1")

4. **Preferences**: Any explicit preferences mentioned (e.g., denomination, preferred topics)

Guidelines:
- Only extract information EXPLICITLY mentioned in the conversation
- Don't make assumptions or inferences beyond what's stated
- For theological topics, use specific terms (not generic "theology")
- For spiritual journey: capture both challenges and growth indicators
- Be concise - each context should be 1-2 sentences max
- Return empty arrays/objects if nothing relevant found

Return a JSON object with this structure:
{
  "theologicalInterests": {
    "topic_name": {
      "count": 1,
      "contexts": ["Brief context from conversation"]
    }
  },
  "personalContext": {
    "lifeStage": "Description if mentioned",
    "concerns": ["Concern 1", "Concern 2"],
    "spiritualJourney": ["Journey note 1", "Journey note 2"]
  },
  "questionPatterns": {
    "Reformed theology": 1,
    "Practical living": 1
  },
  "preferences": {
    "denomination": "if mentioned",
    "preferredTopics": ["topic1"]
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: conversationText }
      ],
      response_format: { type: "json_object" },
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

  const systemPrompt = `You are merging new conversation memories with an existing user profile.

Rules for merging:
1. **Theological Interests**: 
   - Increment counts for existing topics
   - Add new topics
   - Append new contexts (keep max 5 most recent)
   - Update lastMentioned dates

2. **Personal Context**:
   - Update lifeStage if new info is more recent/detailed
   - Merge concerns (deduplicate)
   - Merge spiritual journey notes (chronological)

3. **Question Patterns**:
   - Add counts for categories

4. **Preferences**:
   - Update if explicitly changed
   - Keep existing if not mentioned

Return the complete merged profile as JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: `Existing profile:\n${JSON.stringify(existingProfile, null, 2)}\n\nNew memories:\n${JSON.stringify(newMemories, null, 2)}`
        }
      ],
      response_format: { type: "json_object" },
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
