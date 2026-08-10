import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

const PAGE_MARGIN = 48;
const CONTENT_TOP = 72;
const CONTENT_BOTTOM = 48;
const BODY_SIZE = 10;
const BODY_LEADING = 13.5;
const REPORT_RENDERER_VERSION = "3";

const COLORS = {
  accent: rgb(0.04, 0.36, 0.37),
  accentSoft: rgb(0.9, 0.96, 0.95),
  border: rgb(0.8, 0.82, 0.82),
  heading: rgb(0.08, 0.12, 0.13),
  muted: rgb(0.37, 0.4, 0.41),
  text: rgb(0.16, 0.18, 0.19),
  white: rgb(1, 1, 1),
};

export type SermonPdfMetadata = {
  title: string;
  author?: string;
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
};

function decodeMarkdownEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripInlineMarkdown(value: string): string {
  return decodeMarkdownEntities(value)
    .replaceAll(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replaceAll(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
    .replaceAll(/__([^_]+)__/g, "$1")
    .replaceAll(/\*([^*]+)\*/g, "$1")
    .replaceAll(/_([^_]+)_/g, "$1")
    .trim();
}

function sanitizeForFont(value: string, font: PDFFont): string {
  const replacements: Record<string, string> = {
    "\u00a0": " ",
    "\u2010": "-",
    "\u2011": "-",
    "\u2012": "-",
    "\u2013": "-",
    "\u2014": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2022": "-",
    "\u2026": "...",
  };
  const normalized = Array.from(value.normalize("NFKD"))
    .filter((character) => !/[\u0300-\u036f]/.test(character))
    .map((character) => replacements[character] ?? character);
  return normalized
    .map((character) => {
      try {
        font.widthOfTextAtSize(character, BODY_SIZE);
        return character;
      } catch {
        return "?";
      }
    })
    .join("");
}

function wrapText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const text = sanitizeForFont(value, font).replaceAll(/\s+/g, " ").trim();
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  const pushLongWord = (word: string) => {
    let fragment = "";
    for (const character of word) {
      const candidate = `${fragment}${character}`;
      if (fragment && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment = candidate;
      }
    }
    current = fragment;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      pushLongWord(word);
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

class PdfReportWriter {
  readonly document: PDFDocument;
  readonly fonts: Fonts;
  readonly metadata: SermonPdfMetadata;
  page: PDFPage;
  y: number;
  private pageHasContent = false;

  constructor(
    document: PDFDocument,
    fonts: Fonts,
    metadata: SermonPdfMetadata,
  ) {
    this.document = document;
    this.fonts = fonts;
    this.metadata = metadata;
    this.page = this.addPage();
    this.y = this.page.getHeight() - CONTENT_TOP;
  }

  private addPage(): PDFPage {
    const page = this.document.addPage(PageSizes.A4);
    this.pageHasContent = false;
    const { height, width } = page.getSize();
    page.drawText("CALVINIST PARROT  |  SERMON EVALUATION", {
      x: PAGE_MARGIN,
      y: height - 35,
      size: 8.5,
      font: this.fonts.bold,
      color: COLORS.accent,
    });
    page.drawLine({
      start: { x: PAGE_MARGIN, y: height - 43 },
      end: { x: width - PAGE_MARGIN, y: height - 43 },
      thickness: 0.8,
      color: COLORS.border,
    });
    return page;
  }

  private ensureSpace(height: number) {
    if (this.y - height >= CONTENT_BOTTOM) return;
    this.page = this.addPage();
    this.y = this.page.getHeight() - CONTENT_TOP;
  }

  startNewPage() {
    if (!this.pageHasContent) return;
    this.page = this.addPage();
    this.y = this.page.getHeight() - CONTENT_TOP;
  }

  spacer(height = 7) {
    this.y -= height;
  }

  rule() {
    this.ensureSpace(12);
    this.page.drawLine({
      start: { x: PAGE_MARGIN, y: this.y },
      end: { x: this.page.getWidth() - PAGE_MARGIN, y: this.y },
      thickness: 0.7,
      color: COLORS.border,
    });
    this.pageHasContent = true;
    this.y -= 12;
  }

  text(
    value: string,
    {
      font = this.fonts.regular,
      size = BODY_SIZE,
      color = COLORS.text,
      indent = 0,
      leading = BODY_LEADING,
      before = 0,
      after = 4,
      keepWithNext = 0,
    }: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      leading?: number;
      before?: number;
      after?: number;
      keepWithNext?: number;
    } = {},
  ) {
    const availableWidth =
      this.page.getWidth() - PAGE_MARGIN * 2 - Math.max(indent, 0);
    const lines = wrapText(value, font, size, availableWidth);
    const requiredHeight =
      before + lines.length * leading + after + keepWithNext;
    this.ensureSpace(requiredHeight);
    this.y -= before;
    for (const line of lines) {
      if (line) {
        this.page.drawText(line, {
          x: PAGE_MARGIN + indent,
          y: this.y,
          size,
          font,
          color,
        });
        this.pageHasContent = true;
      }
      this.y -= leading;
    }
    this.y -= after;
  }

  heading(value: string, level: number) {
    const style =
      level === 1
        ? { size: 20, leading: 25, before: 4, after: 11 }
        : level === 2
          ? { size: 15, leading: 19, before: 10, after: 7 }
          : { size: 11.5, leading: 15, before: 7, after: 4 };
    this.text(value, {
      font: this.fonts.bold,
      color: level === 1 ? COLORS.heading : COLORS.accent,
      keepWithNext: BODY_LEADING + 4,
      ...style,
    });
  }

  table(rows: string[][]) {
    if (rows.length === 0) return;
    const columnCount = Math.max(...rows.map((row) => row.length));
    if (columnCount === 0) return;
    const tableWidth = this.page.getWidth() - PAGE_MARGIN * 2;
    const proportions =
      columnCount === 3
        ? [0.25, 0.13, 0.62]
        : columnCount === 2
          ? [0.68, 0.32]
          : Array.from({ length: columnCount }, () => 1 / columnCount);
    const widths = proportions.map((proportion) => tableWidth * proportion);

    const laidOutRows = rows.map((sourceRow, rowIndex) => {
      const row = Array.from({ length: columnCount }, (_, index) =>
        stripInlineMarkdown(sourceRow[index] ?? ""),
      );
      const font = rowIndex === 0 ? this.fonts.bold : this.fonts.regular;
      const size = rowIndex === 0 ? 8.5 : 8.2;
      const cellLines = row.map((cell, index) =>
        wrapText(cell, font, size, widths[index] - 10),
      );
      const rowHeight =
        Math.max(...cellLines.map((lines) => lines.length)) * 11 + 9;
      return { cellLines, font, rowHeight, size };
    });
    const tableHeight =
      laidOutRows.reduce((total, row) => total + row.rowHeight, 0) + 9;
    const pageContentHeight =
      this.page.getHeight() - CONTENT_TOP - CONTENT_BOTTOM;
    if (tableHeight <= pageContentHeight) {
      this.ensureSpace(tableHeight);
    }

    laidOutRows.forEach(({ cellLines, font, rowHeight, size }, rowIndex) => {
      const pageBeforeRow = this.page;
      this.ensureSpace(rowHeight);
      const rowStartsPage = this.page !== pageBeforeRow;
      const top = this.y;
      const bottom = top - rowHeight;
      if (rowIndex === 0) {
        this.page.drawRectangle({
          x: PAGE_MARGIN,
          y: bottom,
          width: tableWidth,
          height: rowHeight,
          color: COLORS.accentSoft,
        });
      }

      if (rowIndex === 0 || rowStartsPage) {
        this.page.drawLine({
          start: { x: PAGE_MARGIN, y: top },
          end: { x: PAGE_MARGIN + tableWidth, y: top },
          thickness: 0.5,
          color: COLORS.border,
        });
      }
      this.page.drawLine({
        start: { x: PAGE_MARGIN, y: bottom },
        end: { x: PAGE_MARGIN + tableWidth, y: bottom },
        thickness: 0.5,
        color: COLORS.border,
      });

      let x = PAGE_MARGIN;
      cellLines.forEach((lines, columnIndex) => {
        this.page.drawLine({
          start: { x, y: bottom },
          end: { x, y: top },
          thickness: 0.5,
          color: COLORS.border,
        });
        lines.forEach((line, lineIndex) => {
          if (!line) return;
          this.page.drawText(line, {
            x: x + 5,
            y: top - 11 - lineIndex * 11,
            size,
            font,
            color: COLORS.text,
          });
        });
        x += widths[columnIndex];
      });
      this.page.drawLine({
        start: { x, y: bottom },
        end: { x, y: top },
        thickness: 0.5,
        color: COLORS.border,
      });
      this.pageHasContent = true;
      this.y = bottom;
    });
    this.y -= 9;
  }

  finish() {
    const pages = this.document.getPages();
    pages.forEach((page, index) => {
      const pageNumber = `Page ${index + 1} of ${pages.length}`;
      const title = sanitizeForFont(this.metadata.title, this.fonts.regular);
      page.drawLine({
        start: { x: PAGE_MARGIN, y: 35 },
        end: { x: page.getWidth() - PAGE_MARGIN, y: 35 },
        thickness: 0.6,
        color: COLORS.border,
      });
      page.drawText(title.slice(0, 70), {
        x: PAGE_MARGIN,
        y: 22,
        size: 7.5,
        font: this.fonts.regular,
        color: COLORS.muted,
      });
      page.drawText(pageNumber, {
        x:
          page.getWidth() -
          PAGE_MARGIN -
          this.fonts.regular.widthOfTextAtSize(pageNumber, 7.5),
        y: 22,
        size: 7.5,
        font: this.fonts.regular,
        color: COLORS.muted,
      });
    });
  }
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = parseTableRow(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replaceAll(" ", "")))
  );
}

export async function renderSermonMarkdownPdf(
  markdown: string,
  metadata: SermonPdfMetadata,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(metadata.title);
  document.setAuthor(metadata.author ?? "Calvinist Parrot");
  document.setCreator(
    `Calvinist Parrot sermon PDF renderer ${REPORT_RENDERER_VERSION}`,
  );
  document.setProducer("Calvinist Parrot");
  document.setCreationDate(new Date(0));
  document.setModificationDate(new Date(0));

  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    mono: await document.embedFont(StandardFonts.Courier),
  };
  const writer = new PdfReportWriter(document, fonts, metadata);
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed) {
      writer.spacer(4);
      continue;
    }
    if (/^[-*_]{3,}$/.test(trimmed)) {
      writer.rule();
      continue;
    }
    if (trimmed.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        if (!isTableSeparator(lines[index])) {
          rows.push(parseTableRow(lines[index]));
        }
        index += 1;
      }
      index -= 1;
      writer.table(rows);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const headingText = stripInlineMarkdown(heading[2]);
      if (heading[1].length === 2 && /^Step [12]\b/i.test(headingText)) {
        writer.startNewPage();
      }
      writer.heading(headingText, heading[1].length);
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      writer.text(`- ${stripInlineMarkdown(bullet[1])}`, {
        indent: 12,
        after: 2,
      });
      continue;
    }
    writer.text(stripInlineMarkdown(trimmed));
  }

  writer.finish();
  return document.save({ useObjectStreams: false });
}
