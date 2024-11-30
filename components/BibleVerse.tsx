// components/BibleVerse.tsx

"use client"

import React, { useEffect, useState } from 'react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "@/components/ui/popover";  
import { parseReference, ParsedReference } from '@/utils/parseReference';
import { getBookId } from '@/utils/bookMappings';
import {
  TranslationBookChapter,
  ChapterVerse,
//   ChapterContent,
  VerseContent,
} from '@/types/bible';

type BibleVerseProps = {
  reference: string;
};

export function BibleVerse({ reference }: BibleVerseProps) {
  const [verseText, setVerseText] = useState<string>('Loading...');

  useEffect(() => {
    const parsed = parseReference(reference);

    if (parsed) {
      const { book, chapter } = parsed;
      // Fetch the chapter data
      fetchChapterData(book, chapter, parsed);
    } else {
      setVerseText('Invalid reference');
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const fetchChapterData = async (bookName: string, chapter: number, parsed: ParsedReference) => {
    try {
      // Map book names to IDs
      const bookId = getBookId(bookName);
      if (!bookId) {
        setVerseText('Unknown book');
        return;
      }

      // Use the BSB translation
      const translation = 'BSB';

      const response = await fetch(`https://bible.helloao.org/api/${translation}/${bookId}/${chapter}.json`);
      if (!response.ok) {
        setVerseText('Error fetching data');
        return;
      }

      const data: TranslationBookChapter = await response.json();

      // Extract verses
      extractVerses(data, parsed);
    } catch (error) {
      console.error('Error fetching chapter data:', error);
      setVerseText('Error loading verse');
    }
  };

  const extractVerses = (chapterData: TranslationBookChapter, parsedRef: ParsedReference) => {
    const { verses } = parsedRef;
    const content = chapterData.chapter.content;

    let verseTexts: string[] = [];

    if (Array.isArray(verses) && verses.length === 2 && typeof verses[0] === 'number') {
      // Range of verses
      const [start, end] = verses as [number, number];
      for (let i = start; i <= end; i++) {
        const verse = content.find(
          (item): item is ChapterVerse => item.type === 'verse' && item.number === i
        );
        if (verse) {
          verseTexts.push(`${i}: ${verse.content.map(extractText).join(' ')}`);
        }
      }
    } else if (Array.isArray(verses)) {
      // List of verses
      verses.forEach((v) => {
        const verse = content.find(
          (item): item is ChapterVerse => item.type === 'verse' && item.number === v
        );
        if (verse) {
          verseTexts.push(`${v}: ${verse.content.map(extractText).join(' ')}`);
        }
      });
    } else {
      // Whole chapter or single verse
      if (typeof verses === 'number') {
        const verse = content.find(
          (item): item is ChapterVerse => item.type === 'verse' && item.number === verses
        );
        if (verse) {
          verseTexts.push(`${verses}: ${verse.content.map(extractText).join(' ')}`);
        }
      } else {
        // Whole chapter
        const allVerses = content.filter((item): item is ChapterVerse => item.type === 'verse');
        verseTexts = allVerses.map(
          (verseItem) => `${verseItem.number}: ${verseItem.content.map(extractText).join(' ')}`
        );
      }
    }

    if (verseTexts.length > 0) {
      setVerseText(verseTexts.join(' '));
    } else {
      setVerseText('Verse not found');
    }
  };

  const extractText = (contentItem: VerseContent | string): string => {
    if (typeof contentItem === 'string') {
      return contentItem;
    } else if ('text' in contentItem && contentItem.text) {
      return contentItem.text;
    } else if ('heading' in contentItem && contentItem.heading) {
      return contentItem.heading;
    } else if ('lineBreak' in contentItem && contentItem.lineBreak) {
      return '\n';
    } else {
      // Handle other types if necessary
      return '';
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="underline cursor-pointer">{reference}</span>
      </PopoverTrigger>
      <PopoverContent>
        <p className="max-w-xs whitespace-pre-wrap">{verseText}</p>
      </PopoverContent>
    </Popover>
  );
}
