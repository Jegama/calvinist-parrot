import { createHash } from "node:crypto";

import { tavily } from "@tavily/core";

import { ChurchEvaluationUpstreamError } from "./runtime";

export const TAVILY_CRAWL_TIMEOUT_SECONDS = 75;
export const TAVILY_EXTRACT_TIMEOUT_SECONDS = 30;

export type ChurchSourcePage = {
  url?: string;
  requestedUrl?: string;
  rawContent?: string;
  favicon?: string | null;
};

export type TavilyCrawlResult = {
  base_url?: string;
  baseUrl?: string;
  results?: ChurchSourcePage[];
};

type TavilyClient = ReturnType<typeof tavily>;

type TavilyExtractResponse = {
  results?: Array<{
    url?: string;
    rawContent?: string;
    favicon?: string | null;
  }>;
};

let tavilyClient: TavilyClient | null = null;

export function getTavilyClient(): TavilyClient {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not configured");
  }

  tavilyClient ??= tavily({ apiKey: process.env.TAVILY_API_KEY });
  return tavilyClient;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function createContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function dropAnchorDupes(data: TavilyCrawlResult): TavilyCrawlResult {
  const results = Array.isArray(data.results) ? data.results : [];
  const baseUrl = data.base_url ?? data.baseUrl;
  if (!results.length) return { base_url: baseUrl, results: [] };

  const clean: ChurchSourcePage[] = [];
  const fragments: ChurchSourcePage[] = [];

  for (const item of results) {
    const url = item.url?.trim();
    if (!url) continue;

    const normalized = {
      ...item,
      url,
      requestedUrl: item.requestedUrl?.trim() || undefined,
      rawContent: normalizeWhitespace(item.rawContent),
    };

    if (url.includes("#")) {
      fragments.push(normalized);
    } else {
      clean.push(normalized);
    }
  }

  const cleanHashes = new Set<string>();
  const cleanUrls = new Set<string>();
  const normalizedResults: ChurchSourcePage[] = [];

  for (const entry of clean) {
    if (cleanUrls.has(entry.url!)) continue;

    const raw = entry.rawContent || "";
    if (!raw && normalizedResults.some((result) => result.url === entry.url)) continue;

    const hash = createContentHash(raw);
    if (raw && cleanHashes.has(hash)) continue;

    cleanUrls.add(entry.url!);
    if (raw) cleanHashes.add(hash);
    normalizedResults.push(entry);
  }

  const fragmentHashes = new Set<string>();
  const cleanTexts = normalizedResults
    .map((entry) => entry.rawContent ?? "")
    .filter(Boolean);

  for (const entry of fragments) {
    const raw = entry.rawContent || "";
    const hash = createContentHash(raw);

    if (raw) {
      if (fragmentHashes.has(hash) || cleanHashes.has(hash)) continue;
      if (cleanTexts.some((text) => text.includes(raw))) continue;
      fragmentHashes.add(hash);
    }

    if (cleanUrls.has(entry.url!)) continue;
    cleanUrls.add(entry.url!);
    normalizedResults.push(entry);
  }

  return { base_url: baseUrl, results: normalizedResults };
}

export async function extractChurchPage(
  requestedUrl: string,
  client: TavilyClient = getTavilyClient(),
  timeoutSeconds = TAVILY_EXTRACT_TIMEOUT_SECONDS,
): Promise<ChurchSourcePage | null> {
  const response = await client.extract([requestedUrl], {
    extractDepth: "advanced",
    format: "markdown",
    timeout: timeoutSeconds,
  }) as TavilyExtractResponse;

  const result = response.results?.[0];
  if (!result?.url || !result.rawContent) return null;

  return {
    requestedUrl,
    url: result.url.trim(),
    rawContent: result.rawContent,
    favicon: result.favicon ?? null,
  };
}

export function mergeExtractedPage(
  pages: ChurchSourcePage[],
  extractedPage: ChurchSourcePage,
): ChurchSourcePage[] {
  const resolvedUrl = extractedPage.url?.trim();
  const requestedUrl = extractedPage.requestedUrl?.trim();
  if (!resolvedUrl || !extractedPage.rawContent) return pages;

  const existingIndex = pages.findIndex((page) => {
    const existingResolved = page.url?.trim();
    const existingRequested = page.requestedUrl?.trim();
    return (
      existingResolved === resolvedUrl ||
      existingResolved === requestedUrl ||
      existingRequested === requestedUrl ||
      existingRequested === resolvedUrl
    );
  });

  if (existingIndex < 0) {
    return [...pages, {
      ...extractedPage,
      url: resolvedUrl,
      requestedUrl: requestedUrl || undefined,
    }];
  }

  const updated = [...pages];
  updated[existingIndex] = {
    ...pages[existingIndex],
    ...extractedPage,
    url: resolvedUrl,
    requestedUrl: requestedUrl || pages[existingIndex].requestedUrl,
    favicon: extractedPage.favicon ?? pages[existingIndex].favicon ?? null,
  };
  return updated;
}

export function toChurchContentBlocks(pages: ChurchSourcePage[]): string {
  return pages
    .map((page, index) => {
      const resolvedUrl = page.url ?? "Unknown URL";
      const requestedLine = page.requestedUrl && page.requestedUrl !== resolvedUrl
        ? `Requested URL: ${page.requestedUrl}\nResolved URL: ${resolvedUrl}`
        : `URL: ${resolvedUrl}`;

      return `### Page ${index + 1}\n${requestedLine}\n--------------------\n${page.rawContent ?? ""}`;
    })
    .join("\n\n");
}

export function createSourcePageMetadata(pages: ChurchSourcePage[]) {
  return pages.map((page) => ({
    requested_url: page.requestedUrl ?? page.url ?? null,
    resolved_url: page.url ?? null,
    content_sha256: createContentHash(normalizeWhitespace(page.rawContent)),
  }));
}

export async function crawlChurchSite(
  website: string,
  client: TavilyClient = getTavilyClient(),
  {
    crawlTimeoutSeconds = TAVILY_CRAWL_TIMEOUT_SECONDS,
    extractTimeoutSeconds = TAVILY_EXTRACT_TIMEOUT_SECONDS,
  }: {
    crawlTimeoutSeconds?: number;
    extractTimeoutSeconds?: number;
  } = {},
): Promise<TavilyCrawlResult> {
  try {
    const [crawlResponse, rootPage] = await Promise.all([
      client.crawl(website, {
        instructions:
          "The website may be written in any language. Semantically locate official pages covering: the church's doctrinal statement or beliefs; church and campus addresses; clergy and governing leaders; ministries; and home, community, or small groups. Do not depend on English page titles or URL words.",
        maxDepth: 2,
        extractDepth: "advanced",
        allowExternal: false,
        timeout: crawlTimeoutSeconds,
      }),
      extractChurchPage(website, client, extractTimeoutSeconds).catch(
        () => null,
      ),
    ]);

    const crawlData = crawlResponse as TavilyCrawlResult;
    const merged = {
      base_url: crawlData.base_url || crawlData.baseUrl || website,
      results: [
        ...(rootPage ? [rootPage] : []),
        ...(Array.isArray(crawlData.results) ? crawlData.results : []),
      ],
    };

    return dropAnchorDupes(merged);
  } catch (error) {
    console.error("church_evaluation_upstream_error", {
      provider: "tavily",
      stage: "crawl",
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    throw new ChurchEvaluationUpstreamError(
      "tavily",
      "crawl",
      { cause: error },
    );
  }
}
