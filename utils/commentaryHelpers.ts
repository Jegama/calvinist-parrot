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

  if (Array.isArray(requestedVerses) && requestedVerses.length > 0) {
    const first = requestedVerses[0];
    const last = requestedVerses[requestedVerses.length - 1];

    if (typeof first === "number") {
      requestedStartVerse = first;
    }

    if (typeof last === "number") {
      requestedEndVerse = last;
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
      currentEndVerse
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
  commentaryEnd: number | null
) => {
  const commentaryEndVerse = commentaryEnd || Infinity; // If null, assume it covers to the end
  return (
    requestedStart <= commentaryEndVerse && requestedEnd >= commentaryStart
  );
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