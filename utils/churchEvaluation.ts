import { tavily } from "@tavily/core";
import OpenAI from "openai";

import type {
  ChurchEvaluationRaw,
  CoreDoctrineKey,
  CoreDoctrineMap,
  CoreDoctrineStatusValue,
  EvaluationStatus,
} from "@/types/church";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

const MODEL = "gpt-5-mini";

type TavilyCrawlResult = {
  base_url?: string;
  results?: Array<{
    url?: string;
    rawContent?: string; // Tavily returns camelCase, not snake_case
    favicon?: string | null;
  }>;
};

const DOCTRINAL_STATEMENT = `# Calvinist Parrot Doctrinal Statement

## Core Doctrines
- The Trinity: We believe in one God, eternally existing in three persons—Father, Son, and Holy Spirit.
- The Gospel: We proclaim that salvation is secured by Christ’s historical death, burial, and resurrection on the third day, demonstrating His victory over sin and death.
- Justification by Faith: Individuals are justified solely by grace alone through faith alone in Christ alone, apart from works.
- The Deity and Humanity of Christ: We affirm that Jesus Christ is truly God and truly man (Vera Deus, vera homo).
- The Authority of Scripture: The Bible is the inspired, inerrant, and infallible Word of God, serving as the ultimate authority in all matters of faith and practice.
- The Incarnation and Virgin Birth: We affirm that Jesus Christ took on human nature through miraculous conception by the Holy Spirit and was born of the Virgin Mary.
- The Atonement (Christ's Saving Work): Christ's sacrificial death on the cross is necessary and sufficient to reconcile sinners to God.
- The Resurrection: We affirm the bodily resurrection of Jesus Christ, confirming His divinity and victory over sin and death.
- Christ's Return and Final Judgment: Jesus Christ will return personally and bodily to judge the living and the dead, culminating in the renewal of all things.
- The Character of God: God is holy, supreme, sovereign, immutable, faithful, good, patient, gracious, merciful, loving, and just; His wrath against sin is real.

## Secondary Doctrines
- Baptism, Church Governance, The Lord's Supper, Spiritual Gifts, Role of Women in the Church, Sanctification, Continuity and Discontinuity, Security of Salvation, The Atonement (How it Works).

## Tertiary Doctrines
- Eschatology, Worship Style, Counseling Approaches, Creation, Christian Liberty, Church Discipline, Parachurch Organizations, Non-essential doctrines.

In all doctrinal matters we uphold unity in essentials, liberty in non-essentials, and charity in all things.`;

const EXTRACTION_INSTRUCTIONS = `Extract doctrinal data and metadata about the church according to the provided JSON schema. Follow these critical rules:

1. Only rely on the supplied pages. Never fabricate facts.
2. Prefer explicit affirmations ("we believe", "we affirm") for every doctrine. If a doctrine is not clearly affirmed or denied, mark it as "unknown".
3. For the core doctrines, use the values "true", "false", or "unknown" only. If the church adopts one of the allowed historic confessions (Westminster, 1644 LBCF, 1689 LBCF, Belgic/Heidelberg/Dort, Helvetic, Scots, French, Irish Articles, Savoy, Consensus Tigurinus, Thirty-Nine Articles), set confession.adopted=true, include the confession name and source URL, and add the note "Essentials inferred from adopted confession (1689 LBCF); not listed individually on this page." (adjust the confession name appropriately).
4. If confession.adopted=true, set all core doctrines to "true" unless the site explicitly denies a doctrine. Do not infer denials.
5. Populate secondary and tertiary doctrine fields with concise phrases when explicitly stated. Otherwise use null.
6. Include short (<=30 word) quotes as notes with their source URL when possible.
7. Populate best_pages_for with the single best URL for each category.
8. Set badges only from the allowed list.
9. Return "null" for any missing string field and [] for missing arrays.
10. Ensure the JSON strictly conforms to the schema.`;

const RESPONSE_SCHEMA = {
  name: "church_evaluation_schema",
  schema: {
    type: "object",
    properties: {
      church: {
        type: "object",
        properties: {
          name: { type: ["string", "null"] },
          website: { type: "string" },
          addresses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                street_1: { type: ["string", "null"] },
                street_2: { type: ["string", "null"] },
                city: { type: ["string", "null"] },
                state: { type: ["string", "null"] },
                post_code: { type: ["string", "null"] },
                source_url: { type: ["string", "null"] },
              },
              required: ["street_1", "street_2", "city", "state", "post_code", "source_url"],
              additionalProperties: false,
            },
          },
          contacts: {
            type: "object",
            properties: {
              phone: { type: ["string", "null"] },
              email: { type: ["string", "null"] },
            },
            required: ["phone", "email"],
            additionalProperties: false,
          },
          service_times: { type: "array", items: { type: "string" } },
          best_pages_for: {
            type: "object",
            properties: {
              beliefs: { type: ["string", "null"] },
              confession: { type: ["string", "null"] },
              about: { type: ["string", "null"] },
              leadership: { type: ["string", "null"] },
            },
            required: ["beliefs", "confession", "about", "leadership"],
            additionalProperties: false,
          },
          denomination: {
            type: "object",
            properties: {
              label: { type: ["string", "null"] },
              confidence: { type: "number" },
              signals: { type: "array", items: { type: "string" } },
            },
            required: ["label", "confidence", "signals"],
            additionalProperties: false,
          },
          confession: {
            type: "object",
            properties: {
              adopted: { type: "boolean" },
              name: { type: ["string", "null"] },
              source_url: { type: ["string", "null"] },
            },
            required: ["adopted", "name", "source_url"],
            additionalProperties: false,
          },
          core_doctrines: {
            type: "object",
            properties: CORE_DOCTRINE_KEYS.reduce<Record<string, unknown>>((acc, key) => {
              acc[key] = { enum: ["true", "false", "unknown"] };
              return acc;
            }, {}),
            required: CORE_DOCTRINE_KEYS,
            additionalProperties: false,
          },
          secondary: {
            type: "object",
            properties: {
              baptism: { type: ["string", "null"] },
              governance: { type: ["string", "null"] },
              lords_supper: { type: ["string", "null"] },
              gifts: { type: ["string", "null"] },
              women_in_church: { type: ["string", "null"] },
              sanctification: { type: ["string", "null"] },
              continuity: { type: ["string", "null"] },
              security: { type: ["string", "null"] },
              atonement_model: { type: ["string", "null"] },
            },
            required: [
              "baptism",
              "governance",
              "lords_supper",
              "gifts",
              "women_in_church",
              "sanctification",
              "continuity",
              "security",
              "atonement_model",
            ],
            additionalProperties: false,
          },
          tertiary: {
            type: "object",
            properties: {
              eschatology: { type: ["string", "null"] },
              worship_style: { type: ["string", "null"] },
              counseling: { type: ["string", "null"] },
              creation: { type: ["string", "null"] },
              christian_liberty: { type: ["string", "null"] },
              discipline: { type: ["string", "null"] },
              parachurch: { type: ["string", "null"] },
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
            additionalProperties: false,
          },
          badges: { type: "array", items: { type: "string" } },
          notes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                text: { type: "string" },
                source_url: { type: "string" },
              },
              required: ["label", "text", "source_url"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "name",
          "website",
          "addresses",
          "contacts",
          "service_times",
          "best_pages_for",
          "denomination",
          "confession",
          "core_doctrines",
          "secondary",
          "tertiary",
          "badges",
          "notes",
        ],
        additionalProperties: false,
      },
    },
    required: ["church"],
    additionalProperties: false,
  },
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
    // console.log("Starting Tavily crawl for:", website);

    const response = (await tavilyClient.crawl(website, {
      instructions:
        "I need the following:\n1. doctrinal statement, their beliefs, doctrine, teaching statement, or statement of faith.\n2. The address of the church/main campus.\n3. Their pastors and elders.",
      max_depth: 2,
      extract_depth: "advanced",
      allow_external: false,
      format: "markdown",
    })) as TavilyCrawlResult;

    // Debug: Log the raw response to see what we're actually getting
    // console.log("Raw Tavily response (first result):", JSON.stringify(response.results?.[0], null, 2));

    // console.log("Tavily crawl response:", {
    //   base_url: response.base_url,
    //   results_count: response.results?.length ?? 0,
    //   has_results: Boolean(response.results?.length),
    //   first_result_preview: response.results?.[0]
    //     ? {
    //       url: response.results[0].url,
    //       content_length: response.results[0].rawContent?.length ?? 0,
    //       has_content: Boolean(response.results[0].rawContent?.trim()),
    //     }
    //     : null,
    //   sample_urls: response.results?.slice(0, 5).map((r) => ({
    //     url: r.url,
    //     content_length: r.rawContent?.length ?? 0,
    //   })),
    // });

    // If crawl returns empty results, try extract as fallback
    if (!response.results || response.results.length === 0) {
      // console.log("Crawl returned no results, trying extract fallback...");

      type TavilyExtractResult = {
        results?: Array<{
          url?: string;
          rawContent?: string;
        }>;
      };

      const extractResponse = (await tavilyClient.extract([website], {
        extract_depth: "advanced",
        format: "markdown",
      })) as TavilyExtractResult;

      // console.log("Extract response:", {
      //   results_count: extractResponse.results?.length ?? 0,
      //   has_results: Boolean(extractResponse.results?.length),
      // });

      if (extractResponse.results && extractResponse.results.length > 0) {
        return {
          base_url: website,
          results: extractResponse.results.map((r) => ({
            url: r.url || website,
            rawContent: r.rawContent || "",
            favicon: null,
          })),
        };
      }
    }

    const cleaned = dropAnchorDupes(response);

    // console.log("After dropAnchorDupes:", {
    //   results_count: cleaned.results?.length ?? 0,
    //   has_results: Boolean(cleaned.results?.length),
    //   sample_results: cleaned.results?.slice(0, 3).map((r) => ({
    //     url: r.url,
    //     content_length: r.rawContent?.length ?? 0,
    //     has_content: Boolean(r.rawContent?.trim()),
    //   })),
    // });

    return cleaned;
  } catch (error) {
    console.error("Tavily crawl error:", error);
    throw new Error(
      `Failed to crawl website: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function extractChurchEvaluation(website: string): Promise<ChurchEvaluationRaw> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
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

  const messages = [
    {
      role: "system" as const,
      content: `${DOCTRINAL_STATEMENT}\n\nYou are a research analyst helping Calvinist Parrot Ministries vet churches. Produce precise, source-grounded JSON according to the schema.`,
    },
    {
      role: "user" as const,
      content: `${EXTRACTION_INSTRUCTIONS}\n\n${contentBlocks}`,
    },
  ];

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
  });

  const message = response.choices?.[0]?.message?.content;
  if (!message) {
    throw new Error("OpenAI returned an empty response");
  }

  return JSON.parse(message) as ChurchEvaluationRaw;
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

  const normalizedCore: CoreDoctrineMap = CORE_DOCTRINE_KEYS.reduce((acc, key) => {
    const value = core[key];
    if (value === "true" || value === "false" || value === "unknown") {
      acc[key] = value;
    } else {
      acc[key] = "unknown";
    }
    return acc;
  }, {} as CoreDoctrineMap);

  if (confessionAdopted) {
    for (const key of CORE_DOCTRINE_KEYS) {
      if (normalizedCore[key] === "unknown") {
        normalizedCore[key] = "true";
      }
    }
  }

  const badges = Array.isArray(raw.church.badges) ? [...new Set(raw.church.badges)] : [];
  if (confessionAdopted && !badges.includes("✅ Confessional Seal")) {
    badges.push("✅ Confessional Seal");
  }

  const trueCount = CORE_DOCTRINE_KEYS.filter((key) => normalizedCore[key] === "true").length;
  const falseCount = CORE_DOCTRINE_KEYS.filter((key) => normalizedCore[key] === "false").length;
  const coreTotal = CORE_DOCTRINE_KEYS.length;
  const coverageRatio = coreTotal === 0 ? 0 : trueCount / coreTotal;

  if (!confessionAdopted && coverageRatio < 0.5 && !badges.includes("⚠️ Low Essentials Coverage")) {
    badges.push("⚠️ Low Essentials Coverage");
  }

  if (falseCount > 0 && !badges.includes("🚫 We Cannot Endorse")) {
    badges.push("🚫 We Cannot Endorse");
  }

  const hasRedFlagBadge = badges.some((badge) => badge === "🚫 We Cannot Endorse" || badge === "🏳️‍🌈 LGBTQ Affirming");

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
    badges,
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
          process.env.NOMINATIM_USER_AGENT ?? "CalvinistParrotChurchFinder/1.0 (contact@calvinistparrot.local)",
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
