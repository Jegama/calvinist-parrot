// utils/parseReference.ts

export type VerseSelection =
  | { type: 'range'; start: number; end: number }
  | { type: 'list'; verses: number[] }
  | { type: 'single'; verse: number };

export interface ParsedReference {
  book: string;
  chapter: number;
  verses?: VerseSelection;
}

const DASH_CHARACTERS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g;

export function parseReference(reference: string): ParsedReference | null {
  try {
    const trimmedReference = reference.trim();
    if (!trimmedReference) {
      return null;
    }

    // Split book and the rest (allow additional colons in the verse portion)
    const [bookChapterRaw, ...versePartSegments] = trimmedReference.split(':');
    if (!bookChapterRaw) {
      return null;
    }
    const versePartRaw = versePartSegments.join(':');

    const bookChapterParts = bookChapterRaw.trim().split(/\s+/);
    if (bookChapterParts.length === 0) {
      return null;
    }

    let book = '';
    let chapterStr = '';

    if (bookChapterParts.length === 1) {
      // Book and chapter are together (e.g., "John3")
      const match = bookChapterParts[0].match(/^(.*?)(\d+)$/);
      if (!match) {
        return null;
      }
      book = match[1];
      chapterStr = match[2];
      if (!book.trim()) {
        return null;
      }
    } else {
      // Book and chapter are separate
      book = bookChapterParts.slice(0, -1).join(' ');
      chapterStr = bookChapterParts[bookChapterParts.length - 1];
    }

    const chapter = parseInt(chapterStr, 10);
    if (Number.isNaN(chapter)) {
      return null;
    }

    const versePart = versePartRaw
      ?.replace(DASH_CHARACTERS, '-')
      .trim();

    // Parse verses
    let verses: VerseSelection | undefined;

    if (versePart) {
      // Handle ranges and lists
      if (versePart.includes('-')) {
        // Range of verses
        const [startStr, endStr] = versePart.split('-');
        let start = parseInt(startStr.trim(), 10);
        let end = parseInt(endStr.trim(), 10);
        if (Number.isNaN(start) || Number.isNaN(end)) {
          return null;
        }
        if (start > end) {
          [start, end] = [end, start];
        }
        verses = { type: 'range', start, end };
      } else if (versePart.includes(',')) {
        // List of verses
        const verseNumbers = versePart
          .split(',')
          .map((v) => parseInt(v.trim(), 10))
          .filter((num) => !Number.isNaN(num));
        if (verseNumbers.length === 0) {
          return null;
        }
        const normalizedList = Array.from(new Set(verseNumbers)).sort(
          (a, b) => a - b
        );
        verses = { type: 'list', verses: normalizedList };
      } else {
        const single = parseInt(versePart, 10);
        if (Number.isNaN(single)) {
          return null;
        }
        verses = { type: 'single', verse: single };
      }
    }

    const normalizedBook = book.replace(/\s+/g, ' ').trim();
    if (!normalizedBook) {
      return null;
    }

    return { book: normalizedBook, chapter, verses };
  } catch (error) {
    console.error('Error parsing reference:', error);
    return null;
  }
}
  