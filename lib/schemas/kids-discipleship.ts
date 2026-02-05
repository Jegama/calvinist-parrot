// lib/schemas/kids-discipleship.ts
// JSON schemas for Kids Discipleship LLM structured outputs - Phase 3

export const KIDS_CALL1_SCHEMA = {
  name: "parent_shepherding_schema",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "A 1-2 sentence summary of the parenting moment and key insight",
      },
      whatMightBeGoingOnInTheHeart: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 3,
        description:
          "2-3 gentle possibilities of what might be going on in the child's heart (one sentence each)",
      },
      gospelConnectionSuggestion: {
        type: "object",
        properties: {
          ageAppropriatePhrase: {
            type: "string",
            description:
              "A simple phrase the parent could use to point the child to Jesus",
          },
          scriptureToShare: {
            type: "string",
            description:
              "An age-appropriate Scripture reference to share with the child",
          },
          explanation: {
            type: "string",
            description:
              "Brief explanation of how to connect this moment to the gospel",
          },
        },
        required: ["ageAppropriatePhrase", "scriptureToShare", "explanation"],
        additionalProperties: false,
      },
      parentShepherdingNextSteps: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 3,
        description: "2-3 practical, actionable next steps for the parent",
      },
      scripture: {
        type: "array",
        items: {
          type: "object",
          properties: {
            reference: {
              type: "string",
              description: "Full Scripture reference (e.g., 'Proverbs 22:6')",
            },
            whyItApplies: {
              type: "string",
              description: "One-sentence explanation of why this passage applies",
            },
          },
          required: ["reference", "whyItApplies"],
          additionalProperties: false,
        },
        minItems: 2,
        maxItems: 3,
        description: "2-3 relevant Scripture passages for the parent",
      },
      encouragementForParent: {
        type: "string",
        description:
          "A warm, encouraging word for the parent (1-2 sentences)",
      },
      safetyFlags: {
        type: "array",
        items: { type: "string" },
        description:
          "Safety codes for urgent concerns only. Allowed: URGENT_SELF_HARM, URGENT_CHILD_SAFETY, URGENT_VIOLENCE_OR_ABUSE, URGENT_MEDICAL_EMERGENCY, URGENT_OTHER_IMMEDIATE_DANGER",
      },
    },
    required: [
      "summary",
      "whatMightBeGoingOnInTheHeart",
      "gospelConnectionSuggestion",
      "parentShepherdingNextSteps",
      "scripture",
      "encouragementForParent",
      "safetyFlags",
    ],
    additionalProperties: false,
  },
};

export const KIDS_CALL2_SCHEMA = {
  name: "kids_tags_and_prayer_schema",
  strict: true,
  schema: {
    type: "object",
    properties: {
      tags: {
        type: "object",
        properties: {
          circumstance: {
            type: "array",
            items: { type: "string" },
            description:
              "1-3 circumstance tags from: Parenting, Sibling conflict, School, Sleep, Mealtime, Church, Friendship, Health, Discipline moment, Teaching moment",
          },
          heartIssue: {
            type: "array",
            items: { type: "string" },
            description:
              "1-3 heart issue tags from: Defiance, Fear, Anxiety, Selfishness, Anger, Impatience, Dishonesty, Laziness, Jealousy, Pride",
          },
          virtue: {
            type: "array",
            items: { type: "string" },
            description:
              "1-3 virtue tags from: Obedience, Patience, Gentleness, Self-control, Kindness, Honesty, Diligence, Courage, Contentment, Generosity",
          },
          developmentalArea: {
            type: "array",
            items: { type: "string" },
            description:
              "1-3 developmental area tags from: Authority acceptance, Emotional regulation, Social skills, Motor skills, Communication, Independence, Responsibility",
          },
        },
        required: ["circumstance", "heartIssue", "virtue", "developmentalArea"],
        additionalProperties: false,
      },
      suggestedChildPrayerRequests: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Short prayer request title (3-7 words)",
            },
            notes: {
              type: "string",
              description:
                "Longer description of what to pray for (1-2 sentences)",
            },
            linkedScripture: {
              type: ["string", "null"],
              description: "Optional Scripture reference related to this prayer need",
            },
          },
          required: ["title", "notes", "linkedScripture"],
          additionalProperties: false,
        },
        minItems: 2,
        maxItems: 4,
        description: "2-4 suggested prayer topics for this child with short titles and descriptions",
      },
      suggestedMonthlyVisionAdjustments: {
        type: "array",
        items: { type: "string" },
        maxItems: 2,
        description:
          "0-2 suggestions for adjusting the monthly vision based on this log",
      },
      parentConsistencyNote: {
        type: ["string", "null"],
        description:
          "Optional note about parent consistency patterns (null if not applicable)",
      },
    },
    required: [
      "tags",
      "suggestedChildPrayerRequests",
      "suggestedMonthlyVisionAdjustments",
      "parentConsistencyNote",
    ],
    additionalProperties: false,
  },
};
