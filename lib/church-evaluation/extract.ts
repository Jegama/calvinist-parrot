import {
  GoogleGenAI,
  ThinkingLevel,
  type Schema,
} from "@google/genai";

import {
  BASIC_FIELDS_PROMPT,
  CORE_DOCTRINES_PROMPT,
  DENOMINATION_CONFESSION_PROMPT,
  RED_FLAGS_PROMPT,
  SECONDARY_DOCTRINES_PROMPT,
  TERTIARY_DOCTRINES_PROMPT,
} from "@/lib/prompts/church-finder";
import {
  BASIC_FIELDS_SCHEMA,
  CORE_DOCTRINES_SCHEMA,
  DENOMINATION_CONFESSION_SCHEMA,
  RED_FLAGS_SCHEMA,
  SECONDARY_DOCTRINES_SCHEMA,
  TERTIARY_DOCTRINES_SCHEMA,
} from "@/lib/schemas/church-finder";
import type {
  BasicFieldsResponse,
  ChurchEvaluationRaw,
  CoreDoctrinesResponse,
  DenominationConfessionResponse,
  RedFlagsResponse,
  SecondaryDoctrinesResponse,
  TertiaryDoctrinesResponse,
} from "@/types/church";
import {
  applyConfessionToCoreDoctrines,
  applyConfessionToSecondary,
} from "@/utils/confessionInference";

import {
  createSourcePageMetadata,
  crawlChurchSite,
  extractChurchPage,
  mergeExtractedPage,
  toChurchContentBlocks,
  type ChurchSourcePage,
} from "./crawl";
import {
  validateCoreDoctrineEvidence,
  validateRedFlagEvidence,
} from "./evidence";
import { EVALUATION_POLICY_VERSION } from "./policy";

export const EVALUATION_MODEL = "gemini-3-flash-preview";
export const EVALUATION_PROMPT_VERSION = "2026-07-26";

const SYSTEM_PROMPT =
  "You are a research analyst helping Calvinist Parrot Ministries vet churches. Produce precise, source-grounded JSON according to the schema.";

let genaiClient: GoogleGenAI | null = null;

function getGenaiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  genaiClient ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return genaiClient;
}

async function generateStructuredResponse<T>({
  client,
  prompt,
  contentBlocks,
  responseSchema,
  label,
  thinkingLevel = ThinkingLevel.LOW,
}: {
  client: GoogleGenAI;
  prompt: string;
  contentBlocks: string;
  responseSchema: unknown;
  label: string;
  thinkingLevel?: ThinkingLevel;
}): Promise<T> {
  const response = await client.models.generateContent({
    model: EVALUATION_MODEL,
    contents: [{
      role: "user",
      parts: [{
        text: `${SYSTEM_PROMPT}\n\n${prompt}\n\n${contentBlocks}`,
      }],
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema as Schema,
      seed: 1689,
      thinkingConfig: { thinkingLevel },
    },
  });

  if (!response.text) {
    throw new Error(`Empty response from ${label}`);
  }

  return JSON.parse(response.text) as T;
}

function assertAccessiblePages(
  website: string,
  pages: ChurchSourcePage[],
): void {
  if (!pages.length) {
    console.error("No pages found after crawl", { website });
    throw new Error(
      "Unable to gather website content for evaluation. The website may be blocking crawlers or may not have accessible content. Please try a different church website.",
    );
  }

  if (pages.length !== 1) return;

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
  const matchedKeywords = blockedKeywords.filter((keyword) =>
    content.includes(keyword)
  );
  const isBlocked =
    matchedKeywords.length >= 2 ||
    (content.length < 1000 && matchedKeywords.length > 0);

  if (isBlocked) {
    console.error("Single crawled page appears to be blocked", {
      website,
      page: pages[0],
    });
    throw new Error(
      "Unable to access website content - the site is blocking automated access. This website uses security measures (like Cloudflare) that prevent evaluation. Please try contacting the church directly or checking if they have their doctrinal statement on another platform.",
    );
  }
}

async function enrichPages(
  pages: ChurchSourcePage[],
  urls: string[],
): Promise<ChurchSourcePage[]> {
  const uniqueUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  if (!uniqueUrls.length) return pages;

  const extractedPages = await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        return await extractChurchPage(url);
      } catch (error) {
        console.warn(`Failed to extract church page ${url}:`, error);
        return null;
      }
    }),
  );

  return extractedPages.reduce(
    (currentPages, page) =>
      page ? mergeExtractedPage(currentPages, page) : currentPages,
    pages,
  );
}

export async function extractChurchEvaluation(
  website: string,
): Promise<ChurchEvaluationRaw> {
  const client = getGenaiClient();
  const crawl = await crawlChurchSite(website);
  let pages = Array.isArray(crawl.results) ? crawl.results : [];

  assertAccessiblePages(website, pages);

  const beliefUrlPatterns = [
    /statement[_-]?of[_-]?faith/i,
    /beliefs?/i,
    /doctrine/i,
    /what[_-]?we[_-]?believe/i,
    /confession/i,
    /\bfaith\b/i,
  ];

  const beliefCandidates = pages
    .map((page) => page.url?.trim())
    .filter((url): url is string => Boolean(url))
    .filter((url) => beliefUrlPatterns.some((pattern) => pattern.test(url)));

  pages = await enrichPages(pages, beliefCandidates);

  let contentBlocks =
    `Base URL: ${crawl.base_url ?? website}\n\n${toChurchContentBlocks(pages)}`;

  const basicFields = await generateStructuredResponse<BasicFieldsResponse>({
    client,
    prompt: BASIC_FIELDS_PROMPT,
    contentBlocks,
    responseSchema: BASIC_FIELDS_SCHEMA,
    label: "Basic Fields extraction",
  });

  const bestPages = Object.values(basicFields.best_pages_for ?? {})
    .filter((url): url is string =>
      typeof url === "string" && url.trim().length > 0
    );

  pages = await enrichPages(pages, bestPages);
  contentBlocks =
    `Base URL: ${crawl.base_url ?? website}\n\n${toChurchContentBlocks(pages)}`;

  const [
    coreDoctrinesRaw,
    secondaryRaw,
    tertiaryRaw,
    denominationConfession,
    redFlags,
  ] = await Promise.all([
    generateStructuredResponse<CoreDoctrinesResponse>({
      client,
      prompt: CORE_DOCTRINES_PROMPT,
      contentBlocks,
      responseSchema: CORE_DOCTRINES_SCHEMA,
      label: "Core Doctrines extraction",
      thinkingLevel: ThinkingLevel.HIGH,
    }),
    generateStructuredResponse<SecondaryDoctrinesResponse>({
      client,
      prompt: SECONDARY_DOCTRINES_PROMPT,
      contentBlocks,
      responseSchema: SECONDARY_DOCTRINES_SCHEMA,
      label: "Secondary Doctrines extraction",
    }),
    generateStructuredResponse<TertiaryDoctrinesResponse>({
      client,
      prompt: TERTIARY_DOCTRINES_PROMPT,
      contentBlocks,
      responseSchema: TERTIARY_DOCTRINES_SCHEMA,
      label: "Tertiary Doctrines extraction",
    }),
    generateStructuredResponse<DenominationConfessionResponse>({
      client,
      prompt: DENOMINATION_CONFESSION_PROMPT,
      contentBlocks,
      responseSchema: DENOMINATION_CONFESSION_SCHEMA,
      label: "Denomination and Confession extraction",
    }),
    generateStructuredResponse<RedFlagsResponse>({
      client,
      prompt: RED_FLAGS_PROMPT,
      contentBlocks,
      responseSchema: RED_FLAGS_SCHEMA,
      label: "Red Flags extraction",
    }),
  ]);

  const groundedCore = validateCoreDoctrineEvidence(coreDoctrinesRaw, pages);
  const groundedRedFlags = validateRedFlagEvidence(redFlags, pages);
  const coreDoctrines = applyConfessionToCoreDoctrines(
    groundedCore.core_doctrines,
    denominationConfession.confession.adopted,
    denominationConfession.confession.name,
  );
  const secondary = applyConfessionToSecondary(
    secondaryRaw.secondary,
    denominationConfession.confession.name,
    denominationConfession.confession.adopted,
  );

  return {
    metadata: {
      model: EVALUATION_MODEL,
      prompt_version: EVALUATION_PROMPT_VERSION,
      policy_version: EVALUATION_POLICY_VERSION,
      evaluated_at: new Date().toISOString(),
      source_pages: createSourcePageMetadata(pages),
    },
    church: {
      name: basicFields.name,
      website: basicFields.website,
      addresses: basicFields.addresses,
      contacts: basicFields.contacts,
      service_times: basicFields.service_times,
      best_pages_for: basicFields.best_pages_for,
      denomination: denominationConfession.denomination,
      confession: denominationConfession.confession,
      core_doctrines: coreDoctrines,
      secondary,
      tertiary: tertiaryRaw.tertiary,
      badges: [
        ...secondaryRaw.badges,
        ...tertiaryRaw.badges,
        ...denominationConfession.badges,
        ...groundedRedFlags.badges,
      ],
      notes: [
        ...groundedCore.notes,
        ...denominationConfession.notes,
        ...groundedRedFlags.notes,
      ],
    },
  };
}
