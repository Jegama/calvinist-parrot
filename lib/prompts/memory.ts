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
   
3. **Question Patterns**: Categorize questions by doctrinal tier:
   - **coreDoctrineQuestions**: Questions about essentials (Trinity, Gospel, Justification, Christ's deity, Scripture authority, Atonement, Resurrection, etc.)
   - **secondaryDoctrineQuestions**: Questions about denominational distinctives (baptism mode, church governance, spiritual gifts, sanctification views, etc.)
   - **tertiaryDoctrineQuestions**: Questions about disputable matters (eschatology, worship style, creation views, Christian liberty, etc.)

4. **Spiritual Status** (PRIVATE - for pastoral sensitivity only, never revealed to user):
   - **spiritualStatus**: Infer from conversation cues:
     * "seeker" - asking about salvation, who Jesus is, how to become a Christian, expressing spiritual uncertainty
     * "new_believer" - mentions recent conversion, basic discipleship questions, early faith struggles
     * "mature_believer" - demonstrates theological knowledge, asks advanced questions, references personal spiritual practices
     * "unclear" - insufficient information to determine
   - **gospelPresented**: Boolean - did the conversation include a clear Gospel presentation (death, burial, resurrection, faith response)?

5. **Ministry Context**: Roles or contexts mentioned (e.g., "parent", "pastor", "teacher", "student", "church_leader", "missionary")
   - Only include if explicitly stated or clearly implied from conversation

6. **Church Involvement**: 
   - "active_member" - mentions regular church attendance, involvement, membership
   - "seeking_church" - looking for a church, asking about church finder, church shopping
   - "unclear" - not mentioned

7. **Learning Preferences**:
   - **followUpTendency**: 
     * "deep_diver" - asks clarifying questions, requests more detail, engages deeply with answers
     * "quick_mover" - asks one question then moves to new topics, prefers brief answers
     * "balanced" - mix of both patterns
   - **preferredDepth**: Only if user explicitly requests:
     * "concise" - user asks for brief/short answers
     * "detailed" - user asks for in-depth explanations, outlines, essays
     * Leave null if not explicitly stated

8. **Preferences**: Preferred topics, theological interests

Guidelines:
- Only extract information EXPLICITLY mentioned or clearly implied in the conversation
- For spiritual status: use conversation cues but be conservative (default to "unclear" if uncertain)
- For doctrinal tiers: classify based on the three-tier framework (Core/Secondary/Tertiary)
- For ministry context: only include if clearly stated or strongly implied
- Be concise - each context should be 1-2 sentences max
- Return empty arrays/objects if nothing relevant found
- NEVER mention spiritual status tracking to the user - it's for pastoral sensitivity only

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
   - Merge concerns (deduplicate, keep max 10 most relevant)
   - Merge spiritual journey notes (chronological order, keep max 10)

3. **Question Patterns** (Doctrinal Tiers):
   - Add counts for core/secondary/tertiary doctrine questions
   - These are simple increments, not complex merges

4. **Spiritual Status** (PRIVATE):
   - Update only if new extraction provides clearer information
   - Priority: seeker > new_believer > mature_believer > unclear
   - If existing status is more specific, keep it unless new info contradicts

5. **Ministry Context**:
   - Merge arrays (deduplicate)
   - Keep all unique contexts mentioned

6. **Church Involvement**:
   - Update if new info is more specific
   - Priority: active_member > seeking_church > unclear

7. **Learning Preferences**:
   - Update followUpTendency if new pattern is clearer
   - Update preferredDepth only if explicitly stated in new extraction

8. **Preferences**:
   - Merge preferred topics (deduplicate)

Return the complete merged profile as JSON. Only include fields that have values.`;

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
            additionalProperties: false,
            properties: {
               coreDoctrineQuestions: { type: "number" },
               secondaryDoctrineQuestions: { type: "number" },
               tertiaryDoctrineQuestions: { type: "number" }
            }
         },
         spiritualStatus: {
            type: "object",
            additionalProperties: false,
            properties: {
               status: { type: "string", enum: ["seeker", "new_believer", "mature_believer", "unclear"] },
               gospelPresented: { type: "boolean" }
            }
         },
         ministryContext: {
            type: "array",
            items: { type: "string" }
         },
         churchInvolvement: {
            type: "string",
            enum: ["active_member", "seeking_church", "unclear"]
         },
         learningPreferences: {
            type: "object",
            additionalProperties: false,
            properties: {
               followUpTendency: { type: "string", enum: ["deep_diver", "quick_mover", "balanced"] },
               preferredDepth: { type: "string", enum: ["concise", "moderate", "detailed"] }
            }
         },
         preferences: {
            type: "object",
            additionalProperties: false,
            properties: {
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
            additionalProperties: false,
            properties: {
               coreDoctrineQuestions: { type: "number" },
               secondaryDoctrineQuestions: { type: "number" },
               tertiaryDoctrineQuestions: { type: "number" }
            }
         },
         spiritualStatus: {
            type: "object",
            additionalProperties: false,
            properties: {
               status: { type: "string", enum: ["seeker", "new_believer", "mature_believer", "unclear"] },
               gospelPresented: { type: "boolean" }
            }
         },
         ministryContext: {
            type: "array",
            items: { type: "string" }
         },
         churchInvolvement: {
            type: "string",
            enum: ["active_member", "seeking_church", "unclear"]
         },
         learningPreferences: {
            type: "object",
            additionalProperties: false,
            properties: {
               followUpTendency: { type: "string", enum: ["deep_diver", "quick_mover", "balanced"] },
               preferredDepth: { type: "string", enum: ["concise", "moderate", "detailed"] }
            }
         },
         preferences: {
            type: "object",
            additionalProperties: false,
            properties: {
               preferredTopics: { type: "array", items: { type: "string" } }
            }
         }
      }
   }
} as const;