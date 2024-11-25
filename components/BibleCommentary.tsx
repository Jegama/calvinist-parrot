// components/BibleCommentary.tsx

"use client";

import React, { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { parseReference, ParsedReference } from "@/utils/parseReference";
import { getBookId } from "@/utils/bookMappings";

interface CommentaryResponse {
  book: {
    introduction: string;
  };
  chapter: {
    number: number;
    introduction: string;
    content: CommentaryContentItem[];
  };
}

interface CommentaryContentItem {
  type: string;
  number: number;
  content: string[];
}

type BibleCommentaryProps = {
  reference: string;
};

export function BibleCommentary({ reference }: BibleCommentaryProps) {
  const [commentaryData, setCommentaryData] = useState<{
    bookIntro: string;
    chapterIntro: string;
    verses: { range: string; content: string }[];
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCommentary = async () => {
      const parsed = parseReference(reference);
      if (parsed) {
        const { book, chapter } = parsed; // Removed 'verses' from here
        const bookId = getBookId(book);
        if (bookId) {
          try {
            const response = await fetch(
              `/api/c/matthew-henry/${bookId}/${chapter}.json`
            );
            if (response.ok) {
              const data: CommentaryResponse = await response.json();
              const extractedData = extractCommentary(data, parsed);
              setCommentaryData(extractedData);
            } else {
              setError("Error fetching commentary");
            }
          } catch (error) {
            console.error("Error fetching commentary:", error);
            setError("Error loading commentary");
          }
        } else {
          setError("Unknown book");
        }
      } else {
        setError("Invalid reference");
      }
    };

    fetchCommentary();
  }, [reference]);

  if (error) {
    return (
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="commentary">
          <AccordionTrigger>Commentary on {reference}</AccordionTrigger>
          <AccordionContent>
            <p className="text-red-500">{error}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  if (!commentaryData) {
    return (
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="commentary">
          <AccordionTrigger>Commentary on {reference}</AccordionTrigger>
          <AccordionContent>
            <p>Loading commentary...</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value={`commentary-${reference}`}>
        <AccordionTrigger>Commentary on {reference}</AccordionTrigger>
        <AccordionContent>
          <Accordion type="multiple" className="w-full mt-2">
            {/* Book Introduction */}
            <AccordionItem value={`book-intro-${reference}`}>
              <AccordionTrigger>Book Introduction</AccordionTrigger>
              <AccordionContent>
                <p className="whitespace-pre-wrap">
                  {commentaryData.bookIntro}
                </p>
              </AccordionContent>
            </AccordionItem>

            {/* Chapter Introduction */}
            <AccordionItem value={`chapter-intro-${reference}`}>
              <AccordionTrigger>Chapter Introduction</AccordionTrigger>
              <AccordionContent>
                <p className="whitespace-pre-wrap">
                  {commentaryData.chapterIntro}
                </p>
              </AccordionContent>
            </AccordionItem>

            {/* Verse Commentaries */}
            {commentaryData.verses.map((verse, index) => (
              <AccordionItem
                key={`verse-${index}-${reference}`}
                value={`verse-${index}-${reference}`}
              >
                <AccordionTrigger>Verses {verse.range}</AccordionTrigger>
                <AccordionContent>
                  <p className="whitespace-pre-wrap">{verse.content}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// Moved 'extractCommentary' outside the component
const extractCommentary = (
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

// Moved 'doesOverlap' outside the component
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
