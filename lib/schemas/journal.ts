export const JOURNAL_CALL1A_SCHEMA = {
    name: "pastoral_overview_schema",
    strict: true,
    schema: {
        type: "object",
        properties: {
            title: {
                type: "string",
                description: "A short title for this reflection (3-7 words)"
            },
            oneSentenceSummary: {
                type: "string",
                description: "A one-sentence summary of the entry and reflection"
            },
            situationSummary: {
                type: "string",
                description: "A 2-3 sentence summary of the situation described"
            }
        },
        required: ["title", "oneSentenceSummary", "situationSummary"],
        additionalProperties: false
    }
};

export const JOURNAL_CALL1B_SCHEMA = {
    name: "heart_analysis_schema",
    strict: true,
    schema: {
        type: "object",
        properties: {
            heartReflection: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 3,
                description: "2-3 concise possibilities of what might be going on in the heart (one sentence each)"
            },
            putOffPutOn: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        putOff: { type: "string", description: "A pattern or behavior to put off, may include Scripture reference" },
                        putOn: { type: "string", description: "The corresponding virtue or behavior to put on, may include Scripture reference" }
                    },
                    required: ["putOff", "putOn"],
                    additionalProperties: false
                },
                minItems: 1,
                maxItems: 3,
                description: "1-3 pairs of put off/put on patterns (each pair has a matching put off and put on)"
            }
        },
        required: ["heartReflection", "putOffPutOn"],
        additionalProperties: false
    }
};

export const JOURNAL_CALL1C_SCHEMA = {
    name: "biblical_guidance_schema",
    strict: true,
    schema: {
        type: "object",
        properties: {
            scripture: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        reference: { type: "string", description: "Full Scripture reference (e.g., 'Romans 8:28')" },
                        whyItApplies: { type: "string", description: "One-sentence explanation of why this passage applies" }
                    },
                    required: ["reference", "whyItApplies"],
                    additionalProperties: false
                },
                minItems: 2,
                maxItems: 3,
                description: "2-3 relevant Scripture passages with one-sentence explanations"
            },
            practicalNextSteps: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                maxItems: 3,
                description: "1-3 concrete, actionable next steps"
            },
            safetyFlags: {
                type: "array",
                items: { type: "string" },
                description: "Urgent-only machine-readable safety codes (empty unless immediate danger). Allowed: URGENT_SELF_HARM, URGENT_CHILD_SAFETY, URGENT_VIOLENCE_OR_ABUSE, URGENT_MEDICAL_EMERGENCY, URGENT_OTHER_IMMEDIATE_DANGER"
            }
        },
        required: ["scripture", "practicalNextSteps", "safetyFlags"],
        additionalProperties: false
    }
};

// Call 2 output JSON schema for structured responses
export const JOURNAL_CALL2_SCHEMA = {
    name: "tags_and_suggestions_schema",
    strict: true,
    schema: {
        type: "object",
        properties: {
            tags: {
                type: "object",
                properties: {
                    circumstance: { type: "array", items: { type: "string" } },
                    heartIssue: { type: "array", items: { type: "string" } },
                    rulingDesire: { type: "array", items: { type: "string" } },
                    virtue: { type: "array", items: { type: "string" } },
                    theologicalTheme: { type: "array", items: { type: "string" } },
                    meansOfGrace: { type: "array", items: { type: "string" } }
                },
                required: ["circumstance", "heartIssue", "rulingDesire", "virtue", "theologicalTheme", "meansOfGrace"],
                additionalProperties: false
            },
            suggestedPrayerRequests: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Short prayer request title (3-7 words)" },
                        notes: { type: "string", description: "Longer description of the prayer request (1-2 sentences)" },
                        linkedScripture: { type: ["string", "null"], description: "Optional Scripture reference" }
                    },
                    required: ["title", "notes", "linkedScripture"],
                    additionalProperties: false
                },
                minItems: 1,
                maxItems: 3,
                description: "1-3 prayer requests with short titles and longer descriptions"
            },
            searchKeywords: {
                type: "array",
                items: { type: "string" },
                description: "Keywords for future search functionality"
            },
            dashboardSignals: {
                type: "object",
                properties: {
                    recurringTheme: { type: ["string", "null"] }
                },
                required: ["recurringTheme"],
                additionalProperties: false
            }
        },
        required: ["tags", "suggestedPrayerRequests", "searchKeywords", "dashboardSignals"],
        additionalProperties: false
    }
};
