import { tavily } from "@tavily/core";
import { GoogleGenAI } from "@google/genai";

import type {
  ChurchEvaluationRaw,
  CoreDoctrineMap,
  CoreDoctrineStatusValue,
  EvaluationStatus,
  BasicFieldsResponse,
  CoreDoctrinesResponse,
  SecondaryDoctrinesResponse,
  TertiaryDoctrinesResponse,
  DenominationConfessionResponse,
  RedFlagsResponse,
} from "@/types/church";

import {
  CORE_DOCTRINE_KEYS,
  BASIC_FIELDS_SCHEMA,
  CORE_DOCTRINES_SCHEMA,
  SECONDARY_DOCTRINES_SCHEMA,
  TERTIARY_DOCTRINES_SCHEMA,
  DENOMINATION_CONFESSION_SCHEMA,
  RED_FLAGS_SCHEMA,
} from "@/lib/schemas/church-finder";
import {
  BASIC_FIELDS_PROMPT,
  CORE_DOCTRINES_PROMPT,
  SECONDARY_DOCTRINES_PROMPT,
  TERTIARY_DOCTRINES_PROMPT,
  DENOMINATION_CONFESSION_PROMPT,
  RED_FLAGS_PROMPT,
} from "@/lib/prompts/church-finder";
import {
  applyConfessionToCoreDoctrines,
  applyConfessionToSecondary,
} from "@/utils/confessionInference";

import { doctrinalStatementContent } from "@/app/doctrinal-statement/page";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const MODEL = "gemini-2.5-flash-lite-preview-09-2025";

type TavilyCrawlResult = {
  base_url?: string;
  results?: Array<{
    url?: string;
    rawContent?: string;
    favicon?: string | null;
  }>;
};

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateContent(content: string, maxLength = 4000): string {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength)}…`;
}

export function dropAnchorDupes(data: TavilyCrawlResult): TavilyCrawlResult {
  const results = Array.isArray(data.results) ? data.results : [];
  if (!results.length) return { base_url: data.base_url, results: [] };

  const clean: typeof results = [];
  const fragments: typeof results = [];

  for (const item of results) {
    const url = item.url?.trim();
    if (!url) continue;
    
    const raw = normalizeWhitespace(item.rawContent ?? "");
    
    if (url.includes("#")) {
      fragments.push({ url, rawContent: raw, favicon: item.favicon });
    } else {
      clean.push({ url, rawContent: raw, favicon: item.favicon });
    }
  }  const cleanHashes = new Set<string>();
  const cleanUrls = new Set<string>();
  const normalizedResults: typeof results = [];

  for (const entry of clean) {
    if (cleanUrls.has(entry.url!)) continue;

    // Only skip if content is truly empty AND we already have content for this URL
    const raw = entry.rawContent || "";
    if (!raw && normalizedResults.some((r) => r.url === entry.url)) continue;

    const hash = createContentHash(raw);
    // Only deduplicate if we have content to compare
    if (raw && cleanHashes.has(hash)) continue;

    cleanUrls.add(entry.url!);
    if (raw) cleanHashes.add(hash);
    normalizedResults.push(entry);
  }

  const fragmentHashes = new Set<string>();
  const cleanTexts = normalizedResults.map((entry) => entry.rawContent ?? "").filter(Boolean);

  for (const entry of fragments) {
    if (cleanUrls.has(entry.url!)) continue;

    const raw = entry.rawContent || "";
    const hash = createContentHash(raw);

    // Only deduplicate if we have meaningful content
    if (raw) {
      if (fragmentHashes.has(hash) || cleanHashes.has(hash)) continue;
      // Check if this fragment's content is already included in a clean page
      if (cleanTexts.some((text) => text.includes(raw))) continue;
      fragmentHashes.add(hash);
    }

    cleanUrls.add(entry.url!);
    normalizedResults.push(entry);
  }

  return { base_url: data.base_url, results: normalizedResults };
}

function createContentHash(text: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  let hash = 0;
  for (const byte of data) {
    hash = (hash << 5) - hash + byte;
    hash |= 0;
  }
  return String(hash);
}

export async function crawlChurchSite(website: string): Promise<TavilyCrawlResult> {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not configured");
  }

  try {

    const response = (await tavilyClient.crawl(website, {
      instructions:
        "I need the following:\n1. doctrinal statement, their beliefs, doctrine, teaching statement, or statement of faith.\n2. The address of the church/main campus.\n3. Their pastors and elders.",
      max_depth: 2,
      extract_depth: "advanced",
      allow_external: false,
    })) as TavilyCrawlResult;

    const cleaned = dropAnchorDupes(response);

    return cleaned;
  } catch (error) {
    console.error("Tavily crawl error:", error);
    throw new Error(
      `Failed to crawl website: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function extractChurchEvaluation(website: string): Promise<ChurchEvaluationRaw> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const crawl = await crawlChurchSite(website);
  const pages = Array.isArray(crawl.results) ? crawl.results : [];

  if (!pages.length) {
    console.error("No pages found after crawl", { website, crawl });
    throw new Error(
      "Unable to gather website content for evaluation. The website may be blocking crawlers or may not have accessible content. Please try a different church website."
    );
  }

  const contentBlocks = pages
    .map((page, index) => {
      const url = page.url ?? "Unknown URL";
      const content = truncateContent(page.rawContent ?? "");
      return `### Page ${index + 1}\nURL: ${url}\n--------------------\n${content}`;
    })
    .join("\n\n");

  const systemPrompt = `${doctrinalStatementContent}\n\nYou are a research analyst helping Calvinist Parrot Ministries vet churches. Produce precise, source-grounded JSON according to the schema.`;

  // ============================================================================
  // Phase 1: Make 5 parallel LLM calls
  // ============================================================================
  console.log("Starting parallel extraction calls...");
  
  const [
    basicFields,
    coreDoctrinesRaw,
    secondaryRaw,
    tertiaryRaw,
    denomConfession,
  ] = await Promise.all([
    // Call 1: Basic Fields
    genai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${BASIC_FIELDS_PROMPT}\n\n${contentBlocks}` }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: BASIC_FIELDS_SCHEMA,
      },
    }).then((res) => {
      if (!res.text) throw new Error("Empty response from Call 1");
      return JSON.parse(res.text) as BasicFieldsResponse;
    }),

    // Call 2: Core Doctrines
    genai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${CORE_DOCTRINES_PROMPT}\n\n${contentBlocks}` }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: CORE_DOCTRINES_SCHEMA,
      },
    }).then((res) => {
      if (!res.text) throw new Error("Empty response from Call 2");
      return JSON.parse(res.text) as CoreDoctrinesResponse;
    }),

    // Call 3: Secondary Doctrines
    genai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${SECONDARY_DOCTRINES_PROMPT}\n\n${contentBlocks}` }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: SECONDARY_DOCTRINES_SCHEMA,
      },
    }).then((res) => {
      if (!res.text) throw new Error("Empty response from Call 3");
      return JSON.parse(res.text) as SecondaryDoctrinesResponse;
    }),

    // Call 4: Tertiary Doctrines
    genai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${TERTIARY_DOCTRINES_PROMPT}\n\n${contentBlocks}` }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: TERTIARY_DOCTRINES_SCHEMA,
      },
    }).then((res) => {
      if (!res.text) throw new Error("Empty response from Call 4");
      return JSON.parse(res.text) as TertiaryDoctrinesResponse;
    }),

    // Call 5: Denomination & Confession
    genai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${DENOMINATION_CONFESSION_PROMPT}\n\n${contentBlocks}` }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: DENOMINATION_CONFESSION_SCHEMA,
      },
    }).then((res) => {
      if (!res.text) throw new Error("Empty response from Call 5");
      return JSON.parse(res.text) as DenominationConfessionResponse;
    }),
  ]);

  console.log("Parallel calls completed. Applying confession inference...");

  // ============================================================================
  // Phase 2: Apply Confession Inference
  // ============================================================================
  const coreDoctrines = applyConfessionToCoreDoctrines(
    coreDoctrinesRaw.core_doctrines,
    denomConfession.confession.adopted
  );

  const secondary = applyConfessionToSecondary(
    secondaryRaw.secondary,
    denomConfession.confession.name,
    denomConfession.confession.adopted
  );

  // ============================================================================
  // Phase 3: Call 6 - Red Flags Analysis
  // ============================================================================
  console.log("Running red flags analysis...");
  
  const redFlags = await genai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemPrompt}\n\n${RED_FLAGS_PROMPT}\n\n${contentBlocks}` }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: RED_FLAGS_SCHEMA,
    },
  }).then((res) => {
    if (!res.text) throw new Error("Empty response from Call 6");
    return JSON.parse(res.text) as RedFlagsResponse;
  });

  // ============================================================================
  // Phase 4: Merge Results
  // ============================================================================
  console.log("Merging results...");

  const allBadges = [
    ...secondaryRaw.badges,
    ...tertiaryRaw.badges,
    ...denomConfession.badges,
    ...redFlags.badges,
  ];

  const allNotes = [
    ...coreDoctrinesRaw.notes,
    ...denomConfession.notes,
    ...redFlags.notes,
  ];

  const evaluationRaw: ChurchEvaluationRaw = {
    church: {
      name: basicFields.name,
      website: basicFields.website,
      addresses: basicFields.addresses,
      contacts: basicFields.contacts,
      service_times: basicFields.service_times,
      best_pages_for: basicFields.best_pages_for,
      denomination: denomConfession.denomination,
      confession: denomConfession.confession,
      core_doctrines: coreDoctrines,
      secondary,
      tertiary: tertiaryRaw.tertiary,
      badges: allBadges,
      notes: allNotes,
    },
  };

  console.log("Extraction complete.");
  return evaluationRaw;
}

export function postProcessEvaluation(raw: ChurchEvaluationRaw): {
  normalizedCore: CoreDoctrineMap;
  badges: string[];
  coverageRatio: number;
  coreOnSiteCount: number;
  status: EvaluationStatus;
} {
  const core = raw.church.core_doctrines ?? ({} as CoreDoctrineMap);
  const confessionAdopted = Boolean(raw.church.confession?.adopted);

  // Normalize core doctrines (already inferred in extractChurchEvaluation, but double-check)
  const normalizedCore: CoreDoctrineMap = CORE_DOCTRINE_KEYS.reduce((acc, key) => {
    const value = core[key];
    if (value === "true" || value === "false" || value === "unknown") {
      acc[key] = value;
    } else {
      acc[key] = "unknown";
    }
    return acc;
  }, {} as CoreDoctrineMap);

  // Get LLM-detected badges
  const llmBadges = Array.isArray(raw.church.badges) ? [...new Set(raw.church.badges)] : [];

  // Count core doctrine statuses
  const trueCount = CORE_DOCTRINE_KEYS.filter((key) => normalizedCore[key] === "true").length;
  const falseCount = CORE_DOCTRINE_KEYS.filter((key) => normalizedCore[key] === "false").length;
  const unknownCount = CORE_DOCTRINE_KEYS.filter((key) => normalizedCore[key] === "unknown").length;
  const coreTotal = CORE_DOCTRINE_KEYS.length;
  const coverageRatio = coreTotal === 0 ? 0 : trueCount / coreTotal;

  // ============================================================================
  // Compute badges (4 computed badges)
  // ============================================================================
  const computedBadges: string[] = [];

  // 1. ✅ Confessional Seal
  if (confessionAdopted) {
    computedBadges.push("✅ Confessional Seal");
  }

  // 2. 🚫 We Cannot Endorse
  if (falseCount > 0) {
    computedBadges.push("🚫 We Cannot Endorse");
  }

  // 3. ⚠️ Low Essentials Coverage
  if (!confessionAdopted && coverageRatio < 0.5) {
    computedBadges.push("⚠️ Low Essentials Coverage");
  }

  // 4. ❓ Unknown
  if (unknownCount > 0) {
    computedBadges.push("❓ Unknown");
  }

  // Merge LLM-detected + computed badges
  const allBadges = [...new Set([...llmBadges, ...computedBadges])];

  // ============================================================================
  // Determine evaluation status
  // ============================================================================
  const hasRedFlagBadge = allBadges.some((badge) =>
    badge === "🚫 We Cannot Endorse" || badge === "🏳️‍🌈 LGBTQ Affirming"
  );

  let status: EvaluationStatus;
  if (hasRedFlagBadge || coverageRatio < 0.5 || falseCount > 0) {
    status = "red_flag";
  } else if (confessionAdopted || coverageRatio >= 0.7) {
    status = "pass";
  } else if (coverageRatio >= 0.5) {
    status = "caution";
  } else {
    status = "red_flag";
  }

  return {
    normalizedCore,
    badges: allBadges,
    coverageRatio,
    coreOnSiteCount: trueCount,
    status,
  };
}

export async function geocodeAddress(
  address: {
    street1?: string | null;
    city?: string | null;
    state?: string | null;
    postCode?: string | null;
  },
  signal?: AbortSignal
): Promise<{ latitude: number | null; longitude: number | null }> {
  const { street1, city, state, postCode } = address;
  const query = [street1, city, state, postCode].filter((part) => Boolean(part && part.trim())).join(", ");

  if (!query) {
    return { latitude: null, longitude: null };
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", `${query} church`);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "CalvinistParrot/0.4.0 (contact@calvinistparrotministries.org)",
      },
      signal,
    });

    if (!response.ok) {
      return { latitude: null, longitude: null };
    }

    const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    if (!Array.isArray(payload) || payload.length === 0) {
      return { latitude: null, longitude: null };
    }

    const [result] = payload;
    const latitude = result.lat ? Number.parseFloat(result.lat) : null;
    const longitude = result.lon ? Number.parseFloat(result.lon) : null;

    return {
      latitude: Number.isFinite(latitude ?? NaN) ? latitude : null,
      longitude: Number.isFinite(longitude ?? NaN) ? longitude : null,
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw error;
    }
    return { latitude: null, longitude: null };
  }
}

export function toCoreDoctrineStatusEnum(value: CoreDoctrineStatusValue): "TRUE" | "FALSE" | "UNKNOWN" {
  if (value === "true") return "TRUE";
  if (value === "false") return "FALSE";
  return "UNKNOWN";
}

export function toEvaluationStatusEnum(value: EvaluationStatus): "PASS" | "CAUTION" | "RED_FLAG" {
  if (value === "pass") return "PASS";
  if (value === "caution") return "CAUTION";
  return "RED_FLAG";
}
