import { describe, expect, it, vi } from "vitest";

import {
  crawlChurchSite,
  dropAnchorDupes,
  mergeExtractedPage,
  toChurchContentBlocks,
} from "./crawl";

describe("church source preparation", () => {
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
    expect(result.base_url).toBe("https://example.church");
  });
});
