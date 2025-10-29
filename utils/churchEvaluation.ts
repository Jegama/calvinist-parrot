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
import { filterAllowlistedBadges } from "@/utils/badges";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const MODEL = "gemini-2.5-flash-preview-09-2025";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Retry wrapper for async functions with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`${operationName} failed (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
        // console.log(`Retrying ${operationName} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Something went wrong with the LLM, please try again: ${lastError?.message || 'Unknown error'}`);
}

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
  } const cleanHashes = new Set<string>();
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

  // console.log(`Starting Tavily crawl for website: ${website}`);

  try {

    const response = (await tavilyClient.crawl(website, {
      instructions:
        "I need the following:\n1. doctrinal statement, their beliefs, doctrine, teaching statement, or statement of faith.\n2. The address of the church/main campus.\n3. Their pastors, elders, bishops, priests, or reverends.",
      max_depth: 2,
      extract_depth: "advanced",
      allow_external: false,
    })) as TavilyCrawlResult;

    const cleaned = dropAnchorDupes(response);

    // console.log(`Cleaned data: ${JSON.stringify(cleaned, null, 2)}`);

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

  // Check if the single page is a blocked/error page
  if (pages.length === 1) {
    const blockedKeywords = [
      "you have been blocked",
      "access denied",
      "please enable cookies",
      "cloudflare ray id",
      "security solution",
      "403 forbidden",
      "401 unauthorized",
    ];

    const content = (pages[0].rawContent ?? "").toLowerCase();
    const contentLength = content.length;
    const matchedKeywords = blockedKeywords.filter((keyword) => content.includes(keyword));

    // console.log("Blocked page check:", {
    //   contentLength,
    //   matchedKeywords,
    //   isShortContent: contentLength < 1000,
    //   hasBlockedKeywords: matchedKeywords.length > 0,
    // });

    // If we have multiple blocking keywords, it's almost certainly a block page
    // OR if content is short AND has blocking keywords
    const isBlocked =
      matchedKeywords.length >= 2 || // Multiple blocking keywords = definite block
      (contentLength < 1000 && matchedKeywords.length > 0); // Short + any keyword

    if (isBlocked) {
      console.error("Single crawled page appears to be blocked", { website, page: pages[0] });
      throw new Error(
        "Unable to access website content - the site is blocking automated access. This website uses security measures (like Cloudflare) that prevent evaluation. Please try contacting the church directly or checking if they have their doctrinal statement on another platform."
      );
    }
  }

  const contentBlocks = pages
    .map((page, index) => {
      const url = page.url ?? "Unknown URL";
      return `### Page ${index + 1}\nURL: ${url}\n--------------------\n${page.rawContent}`;
    })
    .join("\n\n");

  const systemPrompt = `You are a research analyst helping Calvinist Parrot Ministries vet churches. Produce precise, source-grounded JSON according to the schema.`;

  // ============================================================================
  // Phase 1: Make 6 parallel LLM calls
  // ============================================================================
  // console.log("Starting parallel extraction calls (all 6)...");

  const [
    basicFields,
    coreDoctrinesRaw,
    secondaryRaw,
    tertiaryRaw,
    denomConfession,
    redFlags,
  ] = await Promise.all([
    // Call 1: Basic Fields
    withRetry(
      () =>
        genai.models
          .generateContent({
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
              seed: 1689,
            },
          })
          .then((res) => {
            if (!res.text) throw new Error("Empty response from Call 1");
            return JSON.parse(res.text) as BasicFieldsResponse;
          }),
      "Call 1: Basic Fields"
    ),

    // Call 2: Core Doctrines
    withRetry(
      () =>
        genai.models
          .generateContent({
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
              seed: 1689,
            },
          })
          .then((res) => {
            if (!res.text) throw new Error("Empty response from Call 2");
            return JSON.parse(res.text) as CoreDoctrinesResponse;
          }),
      "Call 2: Core Doctrines"
    ),

    // Call 3: Secondary Doctrines
    withRetry(
      () =>
        genai.models
          .generateContent({
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
              seed: 1689,
            },
          })
          .then((res) => {
            if (!res.text) throw new Error("Empty response from Call 3");
            return JSON.parse(res.text) as SecondaryDoctrinesResponse;
          }),
      "Call 3: Secondary Doctrines"
    ),

    // Call 4: Tertiary Doctrines
    withRetry(
      () =>
        genai.models
          .generateContent({
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
              seed: 1689,
            },
          })
          .then((res) => {
            if (!res.text) throw new Error("Empty response from Call 4");
            return JSON.parse(res.text) as TertiaryDoctrinesResponse;
          }),
      "Call 4: Tertiary Doctrines"
    ),

    // Call 5: Denomination & Confession
    withRetry(
      () =>
        genai.models
          .generateContent({
            model: MODEL,
            contents: [
              {
                role: "user",
                parts: [
                  { text: `${systemPrompt}\n\n${DENOMINATION_CONFESSION_PROMPT}\n\n${contentBlocks}` },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: DENOMINATION_CONFESSION_SCHEMA,
              seed: 1689,
            },
          })
          .then((res) => {
            if (!res.text) throw new Error("Empty response from Call 5");
            return JSON.parse(res.text) as DenominationConfessionResponse;
          }),
      "Call 5: Denomination & Confession"
    ),

    // Call 6: Red Flags Analysis
    withRetry(
      () =>
        genai.models
          .generateContent({
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
              seed: 1689,
            },
          })
          .then((res) => {
            if (!res.text) throw new Error("Empty response from Call 6");
            return JSON.parse(res.text) as RedFlagsResponse;
          }),
      "Call 6: Red Flags Analysis"
    ),
  ]);

  // console.log("All 6 parallel calls completed. Checking known confessional churches...");

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
  // Phase 3: Merge Results
  // ============================================================================
  // console.log("Merging results...");

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

  // console.log("Extraction complete.");
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
  const coreTotal = CORE_DOCTRINE_KEYS.length;
  const coverageRatio = coreTotal === 0 ? 0 : trueCount / coreTotal;

  // ============================================================================
  // Compute badges
  // ============================================================================
  const computedBadges: string[] = [];

  if (confessionAdopted && !llmBadges.includes("📜 Reformed")) {
    computedBadges.push("📜 Reformed");
  }

  // Core-denial derived critical red flags (overlap with core definitions)
  if (normalizedCore.trinity === "false") {
    computedBadges.push("⚠️ Non-Trinitarian");
  }
  if (normalizedCore.scripture_authority === "false") {
    computedBadges.push("⚠️ Denies Inerrancy of Scripture");
  }
  if (normalizedCore.justification_by_faith === "false") {
    computedBadges.push("⚠️ Works-Based Justification");
  }
  if (normalizedCore.return_and_judgment === "false") {
    computedBadges.push("⚠️ Universalism");
  }

  if (!confessionAdopted && coverageRatio < 0.5) {
    computedBadges.push("⚠️ Low Essentials Coverage");
  }

  // Informational badges from site structure/availability
  const beliefsUrl = raw.church.best_pages_for?.beliefs ?? null;
  const confessionName = raw.church.confession?.name ?? null;
  const confessionAdopt = Boolean(raw.church.confession?.adopted);
  if (!beliefsUrl && !confessionName && !confessionAdopt) {
    computedBadges.push("ℹ️ No Statement of Faith");
  }
  if (!beliefsUrl && coverageRatio < 0.3) {
    computedBadges.push("ℹ️ Minimal Doctrinal Detail");
  }

  // Merge LLM-detected + computed badges, then enforce allowlist
  const mergedBadges = [...new Set([...computedBadges, ...llmBadges])];
  const allBadges = filterAllowlistedBadges(mergedBadges);

  // ============================================================================
  // Determine evaluation status
  // ============================================================================

  // Derive additional red flags from core notes (core prompt notes-only heterodoxy indicators)
  const lowerNotes = (raw.church.notes || []).map((n) => ({
    label: (n.label || "").toLowerCase(),
    text: (n.text || "").toLowerCase(),
  }));
  const noteIndicates = (tokens: string[]) =>
    lowerNotes.some((n) => tokens.some((t) => n.label.includes(t) || n.text.includes(t)));

  if (noteIndicates(["open theism"])) {
    allBadges.push("⚠️ Open Theism");
  }
  if (noteIndicates(["new apostolic reformation", "modern apostle", "modern apostles", "apostolic government"])) {
    allBadges.push("⚠️ New Apostolic Reformation (NAR)");
  }
  if (noteIndicates(["progressive christianity", "progressive faith"])) {
    allBadges.push("⚠️ Progressive Christianity");
  }
  if (noteIndicates(["religious pluralism", "many paths", "all religions", "interfaith equivalence"])) {
    allBadges.push("⚠️ Religious Pluralism");
  }

  // Define critical red flags that immediately make status NOT_ENDORSED
  const criticalRedFlagBadges = [
    "⚠️ Prosperity Gospel",
    "⚠️ Hyper-Charismatic",
    "⚠️ Entertainment-Driven",
    "🏳️‍🌈 LGBTQ Affirming",
    "👩‍🏫 Ordained Women",
    "⚠️ Denies Inerrancy of Scripture",
    "⚠️ Non-Trinitarian",
    "⚠️ Works-Based Justification",
    "⚠️ Universalism",
    "⚠️ Open Theism",
    "⚠️ New Apostolic Reformation (NAR)",
    "⚠️ Progressive Christianity",
    "⚠️ Religious Pluralism",
  ];

  // Define badges indicating significant secondary differences from Reformed theology
  const secondaryDifferenceBadges = [
    "🔥 Charismatic",
    "🔄 Dispensational",
    "🧑‍🎓 Wesleyan-Holiness",
    "🧱 KJV-Only",
    "🎯 Seeker-Sensitive",
    "🥖 Real Presence (Lutheran)",
    "🧭 Arminian",
  ];

  const hasCriticalRedFlag = allBadges.some((badge) => criticalRedFlagBadges.includes(badge));
  const hasSecondaryDifferences = allBadges.some((badge) => secondaryDifferenceBadges.includes(badge));

  let status: EvaluationStatus;

  // Priority 1: False doctrines OR critical red flags OR low coverage → NOT_ENDORSED
  if (falseCount > 0 || hasCriticalRedFlag || coverageRatio < 0.5) {
    status = "not_endorsed";
  }
  // Priority 2: Significant secondary differences → BIBLICALLY_SOUND_WITH_DIFFERENCES
  else if (hasSecondaryDifferences) {
    status = "biblically_sound_with_differences";
  }
  // Priority 3: Good coverage (>=70%) but not confessional → RECOMMENDED
  else if (coverageRatio >= 0.7) {
    status = "recommended";
  }
  // Priority 4: Moderate coverage (50-70%) → LIMITED_INFORMATION
  else if (coverageRatio >= 0.5) {
    status = "limited_information";
  }
  // Fallback: Should not reach here, but default to LIMITED_INFORMATION
  else {
    status = "limited_information";
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

  if (!process.env.GEOAPIFY_API_KEY) {
    console.warn("GEOAPIFY_API_KEY not configured, skipping geocoding");
    return { latitude: null, longitude: null };
  }

  // Use Geoapify Geocoding API
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", query);
  url.searchParams.set("apiKey", process.env.GEOAPIFY_API_KEY);
  url.searchParams.set("limit", "1");
  url.searchParams.set("type", "amenity"); // Prioritize places of worship

  try {
    const response = await fetch(url.toString(), { signal });

    if (!response.ok) {
      console.warn(`Geocode failed for "${query}": HTTP ${response.status}`);
      return { latitude: null, longitude: null };
    }

    const data = (await response.json()) as {
      features?: Array<{
        geometry?: {
          coordinates?: [number, number]; // [lon, lat]
        };
      }>;
    };

    if (!data.features || data.features.length === 0) {
      console.warn(`No geocode results found for: ${query}`);
      return { latitude: null, longitude: null };
    }

    const coords = data.features[0]?.geometry?.coordinates;
    if (!coords || coords.length !== 2) {
      console.warn(`Invalid coordinates in geocode response for: ${query}`);
      return { latitude: null, longitude: null };
    }

    const [lon, lat] = coords;
    const latitude = Number.isFinite(lat) ? lat : null;
    const longitude = Number.isFinite(lon) ? lon : null;

    // console.log(`Geocode result for "${query}": { lat: ${latitude}, lon: ${longitude} }`);

    return { latitude, longitude };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw error;
    }
    console.error(`Geocode error for "${query}":`, error);
    return { latitude: null, longitude: null };
  }
}

export function toCoreDoctrineStatusEnum(value: CoreDoctrineStatusValue): "TRUE" | "FALSE" | "UNKNOWN" {
  if (value === "true") return "TRUE";
  if (value === "false") return "FALSE";
  return "UNKNOWN";
}

export function toEvaluationStatusEnum(value: EvaluationStatus): "RECOMMENDED" | "BIBLICALLY_SOUND_WITH_DIFFERENCES" | "LIMITED_INFORMATION" | "NOT_ENDORSED" {
  if (value === "recommended") return "RECOMMENDED";
  if (value === "biblically_sound_with_differences") return "BIBLICALLY_SOUND_WITH_DIFFERENCES";
  if (value === "limited_information") return "LIMITED_INFORMATION";
  return "NOT_ENDORSED";
}
