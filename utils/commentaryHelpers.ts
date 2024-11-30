// utils/commentaryHelpers.ts

import { parseReference, ParsedReference } from "@/utils/parseReference";

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
  const requestedStartVerse = Array.isArray(requestedVerses)
    ? requestedVerses[0]
    : requestedVerses;
  const requestedEndVerse = Array.isArray(requestedVerses)
    ? requestedVerses[requestedVerses.length - 1]
    : requestedVerses;

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
    verses.push({
      range: `${requestedStartVerse}${
        requestedEndVerse !== requestedStartVerse ? `-${requestedEndVerse}` : ""
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