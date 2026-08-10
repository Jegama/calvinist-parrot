import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { renderSermonMarkdownPdf } from "@/lib/sermon-evaluation/pdf-report";

const SAMPLE_MARKDOWN = `# Sermon Evaluation Report — The Humility of Christ

**Generated:** 2026-07-28 20:00:00

## Aggregated Summary

**Overall Impact:** 4.4

| Metric | Score | Feedback |
|---|---:|---|
| Textual Fidelity | 4.7 | Careful attention to the passage and its redemptive context. |
| Application Effectiveness | 4.1 | Clear next steps with pastoral warmth. |

## Sermon Structure

### 1. Christ's humility

The sermon traces Philippians 2 and calls the congregation to imitate Christ.

* Explain the humiliation and exaltation of Christ.
* Apply the passage with concrete examples.
`;

describe("sermon Markdown PDF rendering", () => {
  it("creates a readable, versioned PDF document from Markdown", async () => {
    const bytes = await renderSermonMarkdownPdf(SAMPLE_MARKDOWN, {
      title: "The Humility of Christ",
    });
    const document = await PDFDocument.load(bytes);

    expect(Buffer.from(bytes).subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(document.getTitle()).toBe("The Humility of Christ");
    expect(document.getAuthor()).toBe("Calvinist Parrot");
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates long reports without rejecting common Unicode punctuation", async () => {
    const longMarkdown = `${SAMPLE_MARKDOWN}\n\n${Array.from(
      { length: 80 },
      (_, index) =>
        `### Coaching note ${index + 1}\n\n“Patient explanation” — with a focused next step and a brief reference to χάρις.`,
    ).join("\n\n")}`;
    const bytes = await renderSermonMarkdownPdf(longMarkdown, {
      title: "Long coaching report",
    });
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBeGreaterThan(2);
  });

  it("starts the two report phases on fresh pages without creating a blank first page", async () => {
    const bytes = await renderSermonMarkdownPdf(
      `# Sermon Evaluation Report

## Coaching

Keep the text central and make the application concrete.

## Step 1 – Structural Extraction

### Proposition

Christ sustains his people in suffering.

## Step 2 – Analytical Scoring

### Introduction

| Criterion | Score |
|---|---:|
| FCF Introduced | 4 |`,
      { title: "Section pagination" },
    );
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(3);

    const phaseOnlyBytes = await renderSermonMarkdownPdf(
      `## Step 1 – Structural Extraction

Extraction content.

## Step 2 – Analytical Scoring

Scoring content.`,
      { title: "No blank first page" },
    );
    const phaseOnlyDocument = await PDFDocument.load(phaseOnlyBytes);

    expect(phaseOnlyDocument.getPageCount()).toBe(2);
  });
});
