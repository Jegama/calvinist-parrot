import { describe, expect, it } from "vitest";

import {
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
});
