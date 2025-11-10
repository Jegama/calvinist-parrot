export const MEMORY_EXTRACTION_SYS_PROMPT = `You are a memory extraction assistant for a Reformed Christian chatbot.

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

Return only valid JSON matching the schema. No commentary, no markdown.`;

export const MERGE_MEMORIES_SYS_PROMPT = `You are merging new conversation memories with an existing user profile.

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

export const extractionSchema = {
   name: "extracted_memories_schema",
   schema: {
      type: "object",
      additionalProperties: false,
      properties: {
         theologicalInterests: {
            type: "object",
            additionalProperties: {
               type: "object",
               additionalProperties: false,
               properties: {
                  count: { type: "number" },
                  contexts: { type: "array", items: { type: "string" } }
               },
               required: ["count", "contexts"]
            }
         },
         personalContext: {
            type: "object",
            additionalProperties: false,
            properties: {
               lifeStage: { type: "string" },
               concerns: { type: "array", items: { type: "string" } },
               spiritualJourney: { type: "array", items: { type: "string" } }
            }
         },
         questionPatterns: {
            type: "object",
            additionalProperties: { type: "number" }
         },
         preferences: {
            type: "object",
            additionalProperties: false,
            properties: {
               denomination: { type: "string" },
               preferredTopics: { type: "array", items: { type: "string" } }
            }
         }
      }
   }
};

// Schema for the merged profile payload returned by the merge step.
// Mirrors the shape of the extracted memories and the persisted profile fields.
export const mergeSchema = {
   name: "merged_memories_profile_schema",
   schema: {
      type: "object",
      additionalProperties: false,
      properties: {
         theologicalInterests: {
            type: "object",
            additionalProperties: {
               type: "object",
               additionalProperties: false,
               properties: {
                  count: { type: "number" },
                  contexts: { type: "array", items: { type: "string" } }
               },
               required: ["count", "contexts"]
            }
         },
         personalContext: {
            type: "object",
            additionalProperties: false,
            properties: {
               lifeStage: { type: "string" },
               concerns: { type: "array", items: { type: "string" } },
               spiritualJourney: { type: "array", items: { type: "string" } }
            }
         },
         questionPatterns: {
            type: "object",
            additionalProperties: { type: "number" }
         },
         preferences: {
            type: "object",
            additionalProperties: false,
            properties: {
               denomination: { type: "string" },
               preferredTopics: { type: "array", items: { type: "string" } }
            }
         }
      }
   }
} as const;