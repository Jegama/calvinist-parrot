import type {
  CoreDoctrineKey,
} from "@/types/church";

export const CORE_DOCTRINE_KEYS: CoreDoctrineKey[] = [
  "trinity",
  "gospel",
  "justification_by_faith",
  "christ_deity_humanity",
  "scripture_authority",
  "incarnation_virgin_birth",
  "atonement_necessary_sufficient",
  "resurrection_of_jesus",
  "return_and_judgment",
  "character_of_god",
];

// ============================================================================
// Call 1: Basic Fields Schema
// ============================================================================
export const BASIC_FIELDS_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    name: { type: "STRING" as const, nullable: true },
    website: { type: "STRING" as const },
    addresses: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          street_1: { type: "STRING" as const, nullable: true },
          street_2: { type: "STRING" as const, nullable: true },
          city: { type: "STRING" as const, nullable: true },
          state: { type: "STRING" as const, nullable: true },
          post_code: { type: "STRING" as const, nullable: true },
          source_url: { type: "STRING" as const, nullable: true },
        },
        required: ["street_1", "street_2", "city", "state", "post_code", "source_url"],
      },
    },
    contacts: {
      type: "OBJECT" as const,
      properties: {
        phone: { type: "STRING" as const, nullable: true },
        email: { type: "STRING" as const, nullable: true },
      },
      required: ["phone", "email"],
    },
    service_times: { type: "ARRAY" as const, items: { type: "STRING" as const } },
    best_pages_for: {
      type: "OBJECT" as const,
      properties: {
        beliefs: { type: "STRING" as const, nullable: true },
        confession: { type: "STRING" as const, nullable: true },
        about: { type: "STRING" as const, nullable: true },
        leadership: { type: "STRING" as const, nullable: true },
      },
      required: ["beliefs", "confession", "about", "leadership"],
    },
  },
  required: ["name", "website", "addresses", "contacts", "service_times", "best_pages_for"],
};

// ============================================================================
// Call 2: Core Doctrines Schema
// ============================================================================
export const CORE_DOCTRINES_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    core_doctrines: {
      type: "OBJECT" as const,
      properties: CORE_DOCTRINE_KEYS.reduce<Record<string, { type: "STRING"; enum: string[] }>>((acc, key) => {
        acc[key] = { type: "STRING" as const, enum: ["true", "false", "unknown"] };
        return acc;
      }, {}),
      required: CORE_DOCTRINE_KEYS,
    },
    notes: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          label: { type: "STRING" as const },
          text: { type: "STRING" as const },
          source_url: { type: "STRING" as const },
        },
        required: ["label", "text", "source_url"],
      },
    },
  },
  required: ["core_doctrines", "notes"],
};

// ============================================================================
// Call 3: Secondary Doctrines Schema
// ============================================================================
export const SECONDARY_DOCTRINES_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    secondary: {
      type: "OBJECT" as const,
      properties: {
        baptism: { type: "STRING" as const, nullable: true },
        governance: { type: "STRING" as const, nullable: true },
        lords_supper: { type: "STRING" as const, nullable: true },
        gifts: { type: "STRING" as const, nullable: true },
        sanctification: { type: "STRING" as const, nullable: true },
        continuity: { type: "STRING" as const, nullable: true },
        security: { type: "STRING" as const, nullable: true },
        atonement_model: { type: "STRING" as const, nullable: true },
      },
      required: [
        "baptism",
        "governance",
        "lords_supper",
        "gifts",
        "sanctification",
        "continuity",
        "security",
        "atonement_model",
      ],
    },
    badges: { type: "ARRAY" as const, items: { type: "STRING" as const } },
  },
  required: ["secondary", "badges"],
};

// ============================================================================
// Call 4: Tertiary Doctrines Schema
// ============================================================================
export const TERTIARY_DOCTRINES_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    tertiary: {
      type: "OBJECT" as const,
      properties: {
        eschatology: { type: "STRING" as const, nullable: true },
        worship_style: { type: "STRING" as const, nullable: true },
        counseling: { type: "STRING" as const, nullable: true },
        creation: { type: "STRING" as const, nullable: true },
        christian_liberty: { type: "STRING" as const, nullable: true },
        discipline: { type: "STRING" as const, nullable: true },
        parachurch: { type: "STRING" as const, nullable: true },
      },
      required: [
        "eschatology",
        "worship_style",
        "counseling",
        "creation",
        "christian_liberty",
        "discipline",
        "parachurch",
      ],
    },
    badges: { type: "ARRAY" as const, items: { type: "STRING" as const } },
  },
  required: ["tertiary", "badges"],
};

// ============================================================================
// Call 5: Denomination & Confession Schema
// ============================================================================
export const DENOMINATION_CONFESSION_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    denomination: {
      type: "OBJECT" as const,
      properties: {
        label: { type: "STRING" as const, nullable: true },
        confidence: { type: "NUMBER" as const },
        signals: { type: "ARRAY" as const, items: { type: "STRING" as const } },
      },
      required: ["label", "confidence", "signals"],
    },
    confession: {
      type: "OBJECT" as const,
      properties: {
        adopted: { type: "BOOLEAN" as const },
        name: { type: "STRING" as const, nullable: true },
        source_url: { type: "STRING" as const, nullable: true },
      },
      required: ["adopted", "name", "source_url"],
    },
    badges: { type: "ARRAY" as const, items: { type: "STRING" as const } },
    notes: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          label: { type: "STRING" as const },
          text: { type: "STRING" as const },
          source_url: { type: "STRING" as const },
        },
        required: ["label", "text", "source_url"],
      },
    },
  },
  required: ["denomination", "confession", "badges", "notes"],
};

// ============================================================================
// Call 6: Red Flags & Final Analysis Schema
// ============================================================================
export const RED_FLAGS_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    badges: { type: "ARRAY" as const, items: { type: "STRING" as const } },
    notes: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          label: { type: "STRING" as const },
          text: { type: "STRING" as const },
          source_url: { type: "STRING" as const },
        },
        required: ["label", "text", "source_url"],
      },
    },
  },
  required: ["badges", "notes"],
};
