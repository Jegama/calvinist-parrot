// components/BibleCommentary.tsx

"use client";

import React, { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { parseReference } from "@/utils/parseReference";
import { getBookId } from "@/utils/bookMappings";
import { CommentaryResponse, extractCommentary, formatCommentary } from "@/utils/commentaryHelpers";

type BibleCommentaryProps = {
  reference: string;
  onCommentaryExtracted?: (reference: string, formattedCommentary: string) => void;
};

export function BibleCommentary({ reference, onCommentaryExtracted }: BibleCommentaryProps) {
  const [commentaryData, setCommentaryData] = useState<{
    bookIntro: string;
    chapterIntro: string;
    verses: { range: string; content: string }[];
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchCommentary = async () => {
      const parsed = parseReference(reference);
      if (parsed) {
        const { book, chapter } = parsed;
        const bookId = getBookId(book);
        if (bookId) {
          try {
            const response = await fetch(
              `/api/c/matthew-henry/${bookId}/${chapter}.json`
            );
            if (response.ok) {
              const data: CommentaryResponse = await response.json();
              const extractedData = extractCommentary(data, parsed);
              if (isMounted) {
                setCommentaryData(extractedData);

                // Call the callback with formatted commentary
                if (onCommentaryExtracted) {
                  const formattedCommentary = formatCommentary(extractedData, reference);
                  onCommentaryExtracted(reference, formattedCommentary);
                }
              }
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

    return () => {
      isMounted = false;
    };
  }, [reference, onCommentaryExtracted]);

  if (error) {
    return (
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value={`commentary-${reference}`}>
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
        <AccordionItem value={`commentary-${reference}`}>
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
          {/* Context on Top */}
          <p className="mb-4">
            Below you&apos;ll find detailed commentary on {reference}, including introductions and verse-by-verse analysis.
          </p>
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
