// components/VerseRenderer.tsx

import React from 'react';
import { BibleVerse } from '@/components/BibleVerse';
import { bibleVerseRegex } from '@/utils/bibleUtils';

interface VerseRendererProps {
  text: string;
}

export const VerseRenderer: React.FC<VerseRendererProps> = ({ text }) => {
  const tokens = [];
  let lastIndex = 0;
  let match;

  while ((match = bibleVerseRegex.exec(text)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      tokens.push(text.substring(lastIndex, index));
    }
    let verseReference = match[0].trim();
    verseReference = verseReference.replace(/[.,;:]$/, ''); // Remove trailing punctuation
    tokens.push(<BibleVerse key={index} reference={verseReference} />);
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.substring(lastIndex));
  }

  return <>{tokens}</>;
};
