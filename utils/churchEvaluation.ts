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

const MODEL = "gemini-2.5-flash";

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
  "🧑‍🎓 Wesleyan-Holiness",
  "🧱 KJV-Only",
  "🎯 Seeker-Sensitive",
  "🥖 Real Presence (Lutheran)",
  "🧭 Arminian",
];

// Define badges that indicate Reformed distinctives
// Churches must have at least one of these to be "recommended" (in addition to having no secondary differences)
const reformedDistinctiveBadges = [
  "📜 Reformed", // Explicit Reformed soteriology (primary indicator)
  "📃 Covenant Theology", // Reformed hermeneutical framework
  "📖 Expository Preaching", // Reformed emphasis on systematic Bible exposition
  "🎵 Regulative Principle of Worship", // Classic Reformed worship principle
  "👥 Plurality of Elders", // Reformed church governance
  "📚 Catechism Use", // Reformed tradition of catechesis
  "🎶 Exclusive Psalmody", // Stricter Reformed practice
  "🎼 Instrument-Free Worship", // Some Reformed churches (stricter)
  "🕯️ High Church/Liturgical", // Confessional Reformed (Anglican/Lutheran with Reformed theology)
];

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

  }

  const cleanHashes = new Set<string>();
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
    // Run crawl AND extract in parallel to ensure root page content
    const [crawlResponse, extractResponse] = await Promise.all([
      // Existing crawl
      tavilyClient.crawl(website, {
        instructions:
          "I need the following:\n1. doctrinal statement, their beliefs, doctrine, teaching statement, or statement of faith.\n2. The address of the church/main campus.\n3. Their pastors, elders, bishops, priests, or reverends.\n4. Ministries that they have, like Biblical Counseling, Youth Group, Children's Ministry, etc.\n5. If they have home groups/community groups/life groups, etc.",
        max_depth: 2,
        extract_depth: "advanced",
        allow_external: false,
      }),

      // NEW: Extract root page explicitly
      tavilyClient.extract([website], {
        extract_depth: "advanced",
        format: "markdown",
      }).catch(() => ({ results: [] })) // Graceful fallback if root fails
    ]);

    // Merge results: crawl + root extract
    const crawlData = crawlResponse as TavilyCrawlResult;
    const extractData = extractResponse as { results: Array<{ url: string; rawContent?: string; favicon?: string | null }> };

    const mergedResults = [
      ...(Array.isArray(extractData.results) ? extractData.results.map(r => ({
        url: r.url,
        rawContent: r.rawContent,
        favicon: r.favicon
      })) : []),
      ...(Array.isArray(crawlData.results) ? crawlData.results : [])
    ];

    const merged: TavilyCrawlResult = {
      base_url: crawlData.base_url || website,
      results: mergedResults
    };

    // dropAnchorDupes will handle any overlap between extract and crawl
    const cleaned = dropAnchorDupes(merged);
    return cleaned;

  } catch (error) {
    console.error("Tavily crawl error:", error);
    throw new Error(`Failed to crawl website: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function extractChurchEvaluation(website: string): Promise<ChurchEvaluationRaw> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const crawl = await crawlChurchSite(website);
  let pages = Array.isArray(crawl.results) ? crawl.results : [];

  if (!pages.length) {
    console.error("No pages found after crawl", { website, crawl });
    throw new Error(
      "Unable to gather website content for evaluation. The website may be blocking crawlers or may not have accessible content. Please try a different church website."
    );
  }

  // ============================================================================
  // Pre-extract beliefs pages identified by URL pattern (before LLM calls)
  // ============================================================================
  // Tavily crawl often returns shallow content for doctrinal pages.
  // Scan URLs for common beliefs page patterns and extract them immediately.
  const beliefUrlPatterns = [
    /statement[_-]?of[_-]?faith/i,
    /beliefs?/i,
    /doctrine/i,
    /what[_-]?we[_-]?believe/i,
    /confession/i,
    /\bfaith\b/i,
  ];

  const beliefsCandidates = pages
    .map((page) => page.url?.trim())
    .filter((url): url is string => Boolean(url))
    .filter((url) => beliefUrlPatterns.some((pattern) => pattern.test(url)));

  if (beliefsCandidates.length > 0) {
    // console.log(`Pre-extracting ${beliefsCandidates.length} identified beliefs pages...`);

    try {
      const extractedBeliefs = await Promise.all(
        beliefsCandidates.map((url) =>
          tavilyClient.extract([url], {
            extract_depth: "advanced",
            format: "markdown",
          }).catch((error) => {
            console.warn(`Failed to pre-extract beliefs page ${url}:`, error);
            return { results: [] };
          })
        )
      );

      // Replace shallow crawl content with deep extracted content for these URLs
      const urlToExtractedContent = new Map<string, string>();
      extractedBeliefs.forEach((response, idx) => {
        const results = Array.isArray(response.results) ? response.results : [];
        if (results.length > 0 && results[0].rawContent) {
          urlToExtractedContent.set(beliefsCandidates[idx], results[0].rawContent);
        }
      });

      // Update pages array with enriched content
      pages = pages.map((page) => {
        if (page.url && urlToExtractedContent.has(page.url)) {
          return {
            ...page,
            rawContent: urlToExtractedContent.get(page.url)!,
          };
        }
        return page;
      });

      // console.log(`Enriched ${urlToExtractedContent.size} beliefs pages with deep content.`);
    } catch (error) {
      console.warn("Error during pre-extraction of beliefs pages:", error);
      // Continue with original pages if pre-extraction fails
    }
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

  let contentBlocks = pages
    .map((page, index) => {
      const url = page.url ?? "Unknown URL";
      return `### Page ${index + 1}\nURL: ${url}\n--------------------\n${page.rawContent}`;
    })
    .join("\n\n");

  const systemPrompt = `You are a research analyst helping Calvinist Parrot Ministries vet churches. Produce precise, source-grounded JSON according to the schema.`;

  // ============================================================================
  // Phase 1: Extract basic fields first to get bestPages
  // ============================================================================
  // console.log("Extracting basic fields to identify best pages...");

  const basicFields = await genai.models
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
      if (!res.text) throw new Error("Empty response from Basic Fields extraction");
      return JSON.parse(res.text) as BasicFieldsResponse;
    });

  // ============================================================================
  // Phase 2: Always extract all best_pages_for pages (safest, avoids missing key info)
  // ============================================================================
  const bestPages = Object.values(basicFields.best_pages_for ?? {})
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    .map((url) => url.trim());

  const uniqueBestPages = Array.from(new Set(bestPages));

  if (uniqueBestPages.length > 0) {
    // console.log(`Extracting ${uniqueBestPages.length} best_pages_for URLs...`);

    try {
      const additionalExtracts = await Promise.all(
        uniqueBestPages.map(async (url) => {
          try {
            const result = await tavilyClient.extract([url], {
              extract_depth: "advanced",
              format: "markdown",
            });
            return result;
          } catch (err) {
            console.error(`Failed to extract ${url}:`, err);
            return null;
          }
        })
      );

      // Merge successful extracts into pages (replace existing when present)
      for (const extract of additionalExtracts) {
        if (extract?.results?.[0]) {
          const page = extract.results[0];
          if (page.url && page.rawContent) {
            const extractedUrl = page.url.trim();
            const existingIndex = pages.findIndex((p) => (p.url ?? "").trim() === extractedUrl);

            if (existingIndex >= 0) {
              pages[existingIndex] = {
                ...pages[existingIndex],
                url: extractedUrl,
                rawContent: page.rawContent,
                favicon: page.favicon ?? pages[existingIndex].favicon ?? null,
              };
            } else {
              pages.push({
                url: extractedUrl,
                rawContent: page.rawContent,
                favicon: page.favicon ?? null,
              });
            }
          }
        }
      }

      // Rebuild content blocks with enriched pages
      contentBlocks = pages
        .map((page, index) => {
          const url = page.url ?? "Unknown URL";
          return `### Page ${index + 1}\nURL: ${url}\n--------------------\n${page.rawContent}`;
        })
        .join("\n\n");

      // console.log(`Enriched content with ${pages.length} total pages.`);
    } catch (error) {
      console.error("Error during bestPages extraction:", error);
      // Continue with original content if fallback fails
    }
  }

  // console.log(`Crawled and prepared content from ${pages.length} pages for LLM evaluation.\n\n${contentBlocks}`);

  // ============================================================================
  // Phase 3: Make remaining 5 parallel LLM calls with enriched content
  // ============================================================================
  // console.log("Starting parallel extraction calls (remaining 5)...");

  const [
    coreDoctrinesRaw,
    secondaryRaw,
    tertiaryRaw,
    denomConfession,
    redFlags,
  ] = await Promise.all([

    // Call 2: Core Doctrines
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

    // Call 3: Secondary Doctrines
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

    // Call 4: Tertiary Doctrines
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

    // Call 5: Denomination & Confession
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

    // Call 6: Red Flags Analysis
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
  ]);

  // console.log("All 6 parallel calls completed. Checking known confessional churches...");

  // ============================================================================
  // Phase 2: Apply Confession Inference
  // ============================================================================
  const coreDoctrines = applyConfessionToCoreDoctrines(
    coreDoctrinesRaw.core_doctrines,
    denomConfession.confession.adopted,
    denomConfession.confession.name
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
  if (!beliefsUrl && !confessionName && !confessionAdopt && !llmBadges.includes("ℹ️ No Statement of Faith")) {
    computedBadges.push("ℹ️ No Statement of Faith");
  }
  if (!beliefsUrl && coverageRatio < 0.3 && !llmBadges.includes("ℹ️ Minimal Doctrinal Detail")) {
    computedBadges.push("ℹ️ Minimal Doctrinal Detail");
  }

  // Merge LLM-detected + computed badges, then enforce allowlist
  const mergedBadges = [...new Set([...computedBadges, ...llmBadges])];
  const allBadges = filterAllowlistedBadges(mergedBadges);

  // ============================================================================
  // Determine evaluation status
  // ============================================================================

  const hasCriticalRedFlag = allBadges.some((badge) => criticalRedFlagBadges.includes(badge));
  const hasSecondaryDifferences = allBadges.some((badge) => secondaryDifferenceBadges.includes(badge));
  const hasReformedDistinctive = allBadges.some((badge) => reformedDistinctiveBadges.includes(badge));

  let status: EvaluationStatus;

  // Priority 1: False doctrines OR critical red flags → NOT_ENDORSED
  // We only mark as NOT_ENDORSED when we have clear evidence of doctrinal error
  if (falseCount > 0 || hasCriticalRedFlag) {
    status = "not_endorsed";
  }
  // Priority 2: Low coverage (<60%) → LIMITED_INFORMATION
  // Not enough doctrinal clarity online; encourage users to contact the church
  else if (coverageRatio < 0.6) {
    status = "limited_information";
  }
  // Priority 3: Good coverage with Reformed distinctives AND no secondary differences → RECOMMENDED
  // Affirms essentials and demonstrates Reformed theology without problematic secondary positions
  else if (hasReformedDistinctive && !hasSecondaryDifferences) {
    status = "recommended";
  }
  // Priority 4: Everything else with good coverage → BIBLICALLY_SOUND_WITH_DIFFERENCES
  // Either: (a) has secondary theological differences (Arminian, Charismatic, etc.), OR
  //         (b) solid Christian church but lacks Reformed distinctives
  else {
    status = "biblically_sound_with_differences";
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
