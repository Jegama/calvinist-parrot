// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  absolutizeMarkdownLinks,
  markdownToPlainText,
  sanitizeClipboardHtml,
} from "./chat-copy";

describe("chat clipboard formatting", () => {
  it("preserves semantic content without application theme styling", () => {
    const result = sanitizeClipboardHtml(`
      <div class="bg-parrot-message text-white" style="color:white">
        <h2>Grace</h2>
        <p>Saved by <strong>faith</strong>.</p>
        <button>John 3:16</button>
        <script>privatePayload()</script>
      </div>
    `);

    expect(result).toContain("<h2>Grace</h2>");
    expect(result).toContain("<strong>faith</strong>");
    expect(result).toContain("John 3:16");
    expect(result).toContain("color:#000");
    expect(result).not.toContain("text-white");
    expect(result).not.toContain("bg-parrot-message");
    expect(result).not.toContain("color:white");
    expect(result).not.toContain("privatePayload");
  });

  it("preserves Unicode and bidirectional metadata", () => {
    const result = sanitizeClipboardHtml(
      "<p>النعمة — 恩典 — grace</p>",
      { lang: "ar", dir: "auto" },
    );

    expect(result).toContain('lang="ar"');
    expect(result).toContain('dir="auto"');
    expect(result).toContain("النعمة — 恩典 — grace");
  });

  it("creates readable plain text from Markdown", () => {
    expect(
      markdownToPlainText(
        "## Hope\n\n- **Grace**\n- [Scripture](https://example.com)",
      ),
    ).toBe("Hope\n\n• Grace\n• Scripture (https://example.com)");
  });

  it("uses absolute URLs for links in every clipboard format", () => {
    const markdown = "[Church Finder](/church-finder)";
    const baseUrl = "http://localhost:3000";

    expect(absolutizeMarkdownLinks(markdown, baseUrl)).toBe(
      "[Church Finder](http://localhost:3000/church-finder)",
    );
    expect(markdownToPlainText(markdown, { baseUrl })).toBe(
      "Church Finder (http://localhost:3000/church-finder)",
    );
    expect(
      sanitizeClipboardHtml('<a href="/church-finder">Church Finder</a>', {
        baseUrl,
      }),
    ).toContain('href="http://localhost:3000/church-finder"');
  });
});
