import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { tavily } from "@tavily/core";
import { describe, expect, it, vi } from "vitest";

import {
  CHURCH_CRAWL_INSTRUCTIONS,
  crawlChurchSite,
  dropAnchorDupes,
  extractChurchPage,
  mergeExtractedPage,
  toChurchContentBlocks,
} from "./crawl";

const db = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { providerCallAttempt: db } }));

describe("church source preparation", () => {
  it("respects Tavily's 400-character instructions limit", () => {
    expect(Array.from(CHURCH_CRAWL_INSTRUCTIONS).length).toBeLessThanOrEqual(400);
  });

  it("preserves requested and resolved URLs when extraction follows a redirect", () => {
    const pages = mergeExtractedPage(
      [{
        url: "https://example.church/about",
        rawContent: "Shallow navigation content",
      }],
      {
        requestedUrl: "https://example.church/about",
        url: "https://example.church/leadership",
        rawContent: "Leadership content",
      },
    );

    expect(pages).toEqual([{
      requestedUrl: "https://example.church/about",
      url: "https://example.church/leadership",
      rawContent: "Leadership content",
      favicon: null,
    }]);
    expect(toChurchContentBlocks(pages)).toContain(
      "Requested URL: https://example.church/about\nResolved URL: https://example.church/leadership",
    );
  });

  it("deduplicates identical anchor and canonical page content", () => {
    const result = dropAnchorDupes({
      base_url: "https://example.church",
      results: [
        {
          url: "https://example.church/beliefs",
          rawContent: "We believe the Bible.",
        },
        {
          url: "https://example.church/beliefs#scripture",
          rawContent: "We believe the Bible.",
        },
      ],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results?.[0].url).toBe("https://example.church/beliefs");
  });

  it("reads billed credits from the Tavily wire response once per call, including an empty or failed enrichment", async () => {
    const bodies: Record<string, unknown>[] = [];
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      bodies.push(payload);
      const url = payload.url ?? payload.urls[0];
      const failed = url.endsWith("/failed") || url.endsWith("/billed-failure");
      response.writeHead(failed ? 502 : 200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(failed ? { detail: "failed", usage: url.endsWith("/billed-failure") ? { credits: 3 } : undefined } : {
        base_url: url, results: [], failed_results: [], usage: { credits: request.url === "/crawl" ? 4 : 2 },
      }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const apiBaseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const client = tavily({ apiKey: "fixture", apiBaseURL });
      const operation = { operationId: "one-paid-evaluation", channel: "public_api", expectedUsageAttempts: 0 } as const;
      await crawlChurchSite("https://example.church", client, { operation });
      await extractChurchPage("https://example.church/beliefs", client, undefined, operation);
      await expect(extractChurchPage("https://example.church/failed", client, undefined, operation)).rejects.toThrow();
      await expect(extractChurchPage("https://example.church/billed-failure", client, undefined, operation)).rejects.toThrow();
      expect(operation.expectedUsageAttempts).toBe(5);
      expect(bodies).toHaveLength(5);
      expect(bodies.every(body => body.include_usage)).toBe(true);
      const attempts = db.upsert.mock.calls.map(([{ create }]) => create).filter(receipt => receipt.outcome !== "started");
      expect(new Set(attempts.map(receipt => receipt.attemptId)).size).toBe(5);
      for (const attempt of attempts) {
        expect(attempt).toMatchObject({ feature: "church", operationId: operation.operationId, channel: "public_api", provider: "tavily", billingUnit: "credit" });
      }
      expect(attempts.map(attempt => [attempt.stage, attempt.outcome, attempt.quantity])).toEqual(expect.arrayContaining([
        ["crawl", "success", 4], ["root_extract", "success", 2],
        ["enrichment", "success", 2], ["enrichment", "provider_error", null], ["enrichment", "provider_error", 3],
      ]));
      expect(JSON.stringify(attempts)).not.toContain("example.church");
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("passes explicit language-neutral instructions and upstream timeouts", async () => {
    const client = {
      crawl: vi.fn(async () => ({
        baseUrl: "https://example.church",
        results: [{
          url: "https://example.church/creemos",
          rawContent: "Creemos en Dios.",
        }],
      })),
      extract: vi.fn(async () => ({
        results: [],
        failedResults: [],
        responseTime: 0,
        requestId: "extract-1",
      })),
    };

    const result = await crawlChurchSite(
      "https://example.church",
      client as never,
      { crawlTimeoutSeconds: 70, extractTimeoutSeconds: 25 },
    );

    expect(client.crawl).toHaveBeenCalledWith(
      "https://example.church",
      expect.objectContaining({
        maxDepth: 2,
        extractDepth: "advanced",
        allowExternal: false,
        timeout: 70,
        instructions: expect.stringContaining(
          "Do not depend on English page titles or URL words.",
        ),
      }),
    );
    expect(client.extract).toHaveBeenCalledWith(
      ["https://example.church"],
      expect.objectContaining({ timeout: 25 }),
    );
    expect(client.crawl.mock.calls[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ instructions: expect.stringContaining("network affiliations and ongoing cooperative relationships") }),
    ]));
    expect(result.base_url).toBe("https://example.church");
  });
});
