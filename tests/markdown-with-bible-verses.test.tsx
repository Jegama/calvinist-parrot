import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";

describe("MarkdownWithBibleVerses", () => {
  it("hides source-only HTML comments while preserving surrounding Markdown", () => {
    const markup = renderToStaticMarkup(
      <MarkdownWithBibleVerses
        content={`## Rubric sections

<!-- BEGIN GENERATED: RUBRIC -->

### Introduction

Evaluate the sermon opening.

<!-- END GENERATED: RUBRIC -->`}
      />,
    );

    expect(markup).toContain("Rubric sections");
    expect(markup).toContain("Introduction");
    expect(markup).toContain("Evaluate the sermon opening.");
    expect(markup).not.toContain("BEGIN GENERATED");
    expect(markup).not.toContain("END GENERATED");
    expect(markup).not.toContain("&lt;!--");
  });

  it("preserves HTML comment syntax when it is intentionally shown as code", () => {
    const markup = renderToStaticMarkup(
      <MarkdownWithBibleVerses
        content={`\`\`\`html
<!-- This is an example -->
\`\`\``}
      />,
    );

    expect(markup).toContain("&lt;!-- This is an example --&gt;");
  });
});
