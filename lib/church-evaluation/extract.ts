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
import { applyConfessionToSecondary } from "@/utils/confessionInference";

import {
  createSourcePageMetadata,
  crawlChurchSite,
  extractChurchPage,
  mergeExtractedPage,
  toChurchContentBlocks,
  type ChurchSourcePage,
} from "./crawl";
import {
  filterGroundedNotes,
  validateCoreDoctrineEvidence,
  validateRedFlagEvidence,
} from "./evidence";
import { EVALUATION_POLICY_VERSION } from "./policy";
import {
  ChurchEvaluationTimeoutError,
  ChurchEvaluationUpstreamError,
  createEvaluationDeadline,
  GEMINI_STAGE_TIMEOUT_MS,
  runEvaluationStage,
  TAVILY_CRAWL_STAGE_TIMEOUT_MS,
  TAVILY_ENRICHMENT_STAGE_TIMEOUT_MS,
} from "./runtime";

export const EVALUATION_MODEL = "gemini-3.6-flash";
export const EVALUATION_PROMPT_VERSION = "2026-07-28";
export const CORE_EXTRACTION_THINKING_LEVEL = ThinkingLevel.MEDIUM;

const SYSTEM_PROMPT =
  "You are a multilingual research analyst helping Calvinist Parrot Ministries vet churches. Interpret official content semantically in its source language and produce precise, source-grounded JSON according to the schema.";

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
  signal,
  thinkingLevel = ThinkingLevel.LOW,
}: {
  client: GoogleGenAI;
  prompt: string;
  contentBlocks: string;
  responseSchema: unknown;
  label: string;
  signal: AbortSignal;
  thinkingLevel?: ThinkingLevel;
}): Promise<T> {
  try {
    const response = await client.models.generateContent({
      model: EVALUATION_MODEL,
      contents: [{
        role: "user",
        parts: [{
          text: `${SYSTEM_PROMPT}\n\n${prompt}\n\n${contentBlocks}`,
        }],
      }],
      config: {
        abortSignal: signal,
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
  } catch (error) {
    if (
      signal.aborted &&
      signal.reason instanceof ChurchEvaluationTimeoutError
    ) {
      throw signal.reason;
    }

    throw new ChurchEvaluationUpstreamError(
      "gemini",
      label,
      { cause: error },
    );
  }
}

function assertAccessiblePages(
  website: string,
  pages: ChurchSourcePage[],
): void {
  if (!pages.length) {
    console.error("church_evaluation_no_pages", {
      website_hostname: new URL(website).hostname,
      source_page_count: 0,
    });
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
    console.error("church_evaluation_access_blocked", {
      website_hostname: new URL(website).hostname,
      source_page_count: 1,
      input_character_count: content.length,
      matched_block_signal_count: matchedKeywords.length,
    });
    throw new Error(
      "Unable to access website content - the site is blocking automated access. This website uses security measures (like Cloudflare) that prevent evaluation. Please try contacting the church directly or checking if they have their doctrinal statement on another platform.",
    );
  }
}

async function enrichPages(
  pages: ChurchSourcePage[],
  urls: string[],
  extractPage: typeof extractChurchPage,
): Promise<ChurchSourcePage[]> {
  const uniqueUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  if (!uniqueUrls.length) return pages;

  const extractedPages = await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        return await extractPage(url);
      } catch (error) {
        console.warn("church_evaluation_enrichment_page_failed", {
          error_name: error instanceof Error ? error.name : "UnknownError",
        });
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

type ChurchEvaluationDependencies = {
  client?: GoogleGenAI;
  crawl?: typeof crawlChurchSite;
  extractPage?: typeof extractChurchPage;
};

function contentCharacterCount(pages: ChurchSourcePage[]): number {
  return pages.reduce(
    (total, page) => total + (page.rawContent?.length ?? 0),
    0,
  );
}

export async function extractChurchEvaluation(
  website: string,
  dependencies: ChurchEvaluationDependencies = {},
): Promise<ChurchEvaluationRaw> {
  const client = dependencies.client ?? getGenaiClient();
  const crawlSite = dependencies.crawl ?? crawlChurchSite;
  const extractPage = dependencies.extractPage ?? extractChurchPage;
  const deadlineAt = createEvaluationDeadline();
  const crawl = await runEvaluationStage({
    stage: "tavily_crawl",
    deadlineAt,
    maxDurationMs: TAVILY_CRAWL_STAGE_TIMEOUT_MS,
    operation: () => crawlSite(website),
    resultDimensions: (result) => ({
      sourcePageCount: result.results?.length ?? 0,
      inputCharacterCount: contentCharacterCount(result.results ?? []),
    }),
  });
  let pages = Array.isArray(crawl.results) ? crawl.results : [];

  assertAccessiblePages(website, pages);

  let contentBlocks =
    `Base URL: ${crawl.base_url ?? website}\n\n${toChurchContentBlocks(pages)}`;

  const basicFields = await runEvaluationStage({
    stage: "gemini_basic_fields",
    deadlineAt,
    maxDurationMs: GEMINI_STAGE_TIMEOUT_MS,
    dimensions: {
      sourcePageCount: pages.length,
      inputCharacterCount: contentBlocks.length,
    },
    operation: (signal) => generateStructuredResponse<BasicFieldsResponse>({
      client,
      prompt: BASIC_FIELDS_PROMPT,
      contentBlocks,
      responseSchema: BASIC_FIELDS_SCHEMA,
      label: "basic_fields",
      signal,
    }),
  });

  const bestPages = Object.values(basicFields.best_pages_for ?? {})
    .filter((url): url is string =>
      typeof url === "string" && url.trim().length > 0
    );

  pages = await runEvaluationStage({
    stage: "tavily_enrichment",
    deadlineAt,
    maxDurationMs: TAVILY_ENRICHMENT_STAGE_TIMEOUT_MS,
    dimensions: {
      sourcePageCount: pages.length,
      inputCharacterCount: contentCharacterCount(pages),
    },
    operation: () => enrichPages(pages, bestPages, extractPage),
    resultDimensions: (result) => ({
      sourcePageCount: result.length,
      inputCharacterCount: contentCharacterCount(result),
    }),
  });
  contentBlocks =
    `Base URL: ${crawl.base_url ?? website}\n\n${toChurchContentBlocks(pages)}`;

  const [
    coreDoctrinesRaw,
    secondaryRaw,
    tertiaryRaw,
    denominationConfession,
    redFlags,
  ] = await Promise.all([
    runEvaluationStage({
      stage: "gemini_core_doctrines",
      deadlineAt,
      maxDurationMs: GEMINI_STAGE_TIMEOUT_MS,
      dimensions: {
        sourcePageCount: pages.length,
        inputCharacterCount: contentBlocks.length,
      },
      operation: (signal) => generateStructuredResponse<CoreDoctrinesResponse>({
        client,
        prompt: CORE_DOCTRINES_PROMPT,
        contentBlocks,
        responseSchema: CORE_DOCTRINES_SCHEMA,
        label: "core_doctrines",
        signal,
        thinkingLevel: CORE_EXTRACTION_THINKING_LEVEL,
      }),
    }),
    runEvaluationStage({
      stage: "gemini_secondary_doctrines",
      deadlineAt,
      maxDurationMs: GEMINI_STAGE_TIMEOUT_MS,
      dimensions: {
        sourcePageCount: pages.length,
        inputCharacterCount: contentBlocks.length,
      },
      operation: (signal) =>
        generateStructuredResponse<SecondaryDoctrinesResponse>({
          client,
          prompt: SECONDARY_DOCTRINES_PROMPT,
          contentBlocks,
          responseSchema: SECONDARY_DOCTRINES_SCHEMA,
          label: "secondary_doctrines",
          signal,
        }),
    }),
    runEvaluationStage({
      stage: "gemini_tertiary_doctrines",
      deadlineAt,
      maxDurationMs: GEMINI_STAGE_TIMEOUT_MS,
      dimensions: {
        sourcePageCount: pages.length,
        inputCharacterCount: contentBlocks.length,
      },
      operation: (signal) =>
        generateStructuredResponse<TertiaryDoctrinesResponse>({
          client,
          prompt: TERTIARY_DOCTRINES_PROMPT,
          contentBlocks,
          responseSchema: TERTIARY_DOCTRINES_SCHEMA,
          label: "tertiary_doctrines",
          signal,
        }),
    }),
    runEvaluationStage({
      stage: "gemini_denomination_confession",
      deadlineAt,
      maxDurationMs: GEMINI_STAGE_TIMEOUT_MS,
      dimensions: {
        sourcePageCount: pages.length,
        inputCharacterCount: contentBlocks.length,
      },
      operation: (signal) =>
        generateStructuredResponse<DenominationConfessionResponse>({
          client,
          prompt: DENOMINATION_CONFESSION_PROMPT,
          contentBlocks,
          responseSchema: DENOMINATION_CONFESSION_SCHEMA,
          label: "denomination_confession",
          signal,
        }),
    }),
    runEvaluationStage({
      stage: "gemini_red_flags",
      deadlineAt,
      maxDurationMs: GEMINI_STAGE_TIMEOUT_MS,
      dimensions: {
        sourcePageCount: pages.length,
        inputCharacterCount: contentBlocks.length,
      },
      operation: (signal) => generateStructuredResponse<RedFlagsResponse>({
        client,
        prompt: RED_FLAGS_PROMPT,
        contentBlocks,
        responseSchema: RED_FLAGS_SCHEMA,
        label: "red_flags",
        signal,
      }),
    }),
  ]);

  const groundedCore = validateCoreDoctrineEvidence(coreDoctrinesRaw, pages);
  const groundedRedFlags = validateRedFlagEvidence(redFlags, pages);
  const groundedDenominationNotes = filterGroundedNotes(
    denominationConfession.notes,
    pages,
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
      core_doctrines: groundedCore.core_doctrines,
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
        ...groundedDenominationNotes,
        ...groundedRedFlags.notes,
      ],
    },
  };
}
