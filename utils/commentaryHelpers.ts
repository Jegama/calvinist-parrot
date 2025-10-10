// utils/commentaryHelpers.ts

import { ParsedReference } from "@/utils/parseReference";

export interface CommentaryResponse {
    book: {
        introduction: string;
    };
    chapter: {
        number: number;
        introduction: string;
        content: CommentaryContentItem[];
    };
}

export interface CommentaryContentItem {
    type: string;
    number: number;
    content: string[];
}  

export const extractCommentary = (
  commentaryData: CommentaryResponse,
  parsedRef: ParsedReference
) => {
  const { verses: requestedVerses } = parsedRef;

  let requestedStartVerse = 1;
  let requestedEndVerse: number = Infinity;
  let requestedSpecificVerses: Set<number> | null = null;

  if (requestedVerses) {
    switch (requestedVerses.type) {
      case 'range': {
        requestedStartVerse = requestedVerses.start;
        requestedEndVerse = requestedVerses.end;
        break;
      }
      case 'list': {
        if (requestedVerses.verses.length > 0) {
          requestedStartVerse = requestedVerses.verses[0];
          requestedEndVerse =
            requestedVerses.verses[requestedVerses.verses.length - 1];
          requestedSpecificVerses = new Set(requestedVerses.verses);
        }
        break;
      }
      case 'single': {
        requestedStartVerse = requestedVerses.verse;
        requestedEndVerse = requestedVerses.verse;
        requestedSpecificVerses = new Set([requestedVerses.verse]);
        break;
      }
    }
  }

  // Build the verse ranges for each commentary entry
  const contentItems = commentaryData.chapter.content;
  const verses: { range: string; content: string }[] = [];

  for (let i = 0; i < contentItems.length; i++) {
    const currentItem = contentItems[i];
    const currentStartVerse = currentItem.number;
    const nextItem = contentItems[i + 1];
    const nextStartVerse = nextItem ? nextItem.number : null;

    // Determine the end verse for the current commentary item
    const currentEndVerse = nextStartVerse
      ? nextStartVerse - 1
      : null; // null indicates it covers to the end of the chapter

    // Check if the current commentary item's verse range overlaps with the requested verses
    const overlaps = doesOverlap(
      requestedStartVerse,
      requestedEndVerse,
      currentStartVerse,
      currentEndVerse,
      requestedSpecificVerses
    );

    if (overlaps) {
      const verseRange = currentEndVerse
        ? `${currentStartVerse}-${currentEndVerse}`
        : `${currentStartVerse}-end`;

      verses.push({
        range: verseRange,
        content: currentItem.content.join(" "),
      });
    }
  }

  // If no commentary entries matched, inform the user
  if (verses.length === 0) {
    const requestedEndLabel = Number.isFinite(requestedEndVerse)
      ? requestedEndVerse
      : "end";
    verses.push({
      range: `${requestedStartVerse}${
        requestedEndLabel !== requestedStartVerse ? `-${requestedEndLabel}` : ""
      }`,
      content: "No commentary available for the requested verses.",
    });
  }

  return {
    bookIntro: commentaryData.book.introduction,
    chapterIntro: commentaryData.chapter.introduction,
    verses: verses,
  };
};

const doesOverlap = (
  requestedStart: number,
  requestedEnd: number,
  commentaryStart: number,
  commentaryEnd: number | null,
  requestedSpecificVerses: Set<number> | null
) => {
  const commentaryEndVerse = commentaryEnd ?? Infinity;

  if (requestedSpecificVerses && requestedSpecificVerses.size > 0) {
    for (const verse of requestedSpecificVerses) {
      if (verse >= commentaryStart && verse <= commentaryEndVerse) {
        return true;
      }
    }
    return false;
  }

  return requestedStart <= commentaryEndVerse && requestedEnd >= commentaryStart;
};

// **Helper function to format the commentary data**
export const formatCommentary = (
  data: {
    bookIntro: string;
    chapterIntro: string;
    verses: { range: string; content: string }[];
  },
  reference: string
) => {
  let formatted = `Commentary on ${reference}:\n\n`;

  formatted += `Book Introduction:\n${data.bookIntro}\n\n`;
  formatted += `Chapter Introduction:\n${data.chapterIntro}\n\n`;

  data.verses.forEach((verse) => {
    formatted += `Verses ${verse.range}:\n${verse.content}\n\n`;
  });

  return formatted.trim();
};