// utils/bibleUtils.ts

import { getBookId } from '@/utils/bookMappings';
import { TranslationBookChapter, ChapterVerse, VerseContent } from '@/types/bible';

export async function getBibleCommentary(
    commentaryId: string,
    book: string,
    chapter: number,
    verses?: number | number[]
  ): Promise<string> {
    console.log(`getBibleCommentary called with:`, { commentaryId, book, chapter, verses });
    try {
        const bookId = getBookId(book);
        const response = await fetch(`https://bible.helloao.org/api/c/${commentaryId}/${bookId}/${chapter}.json`);
        if (!response.ok) {
            console.error(`Error fetching commentary: ${response.statusText}`);
            return 'Error fetching commentary';
        }

        const data = await response.json();
        console.log(`Commentary data received:`, data);

        let commentaryText = '';

        if (data.chapter.introduction) {
            commentaryText += data.chapter.introduction + '\n\n';
        }

        const content = data.chapter.content;

        interface CommentaryVerseContent {
            type: 'verse';
            number: number;
            content: VerseContent[];
        }

        content.forEach((item: CommentaryVerseContent) => {
        if (item.type === 'verse') {
            const verseContent: string = item.content.map(extractText).join(' ');
            commentaryText += `${item.number}: ${verseContent}\n`;
        }
        });

        console.log(`Returning commentary text:`, commentaryText.substring(0, 100) + '...');
        return commentaryText;
    } catch (error) {
        console.error('Error in getBibleCommentary:', error);
        return 'Error loading commentary';
    }
}

function extractText(contentItem: VerseContent | string): string {
  if (typeof contentItem === 'string') {
    return contentItem;
  } else if ('text' in contentItem && contentItem.text) {
    return contentItem.text;
  } else if ('heading' in contentItem && contentItem.heading) {
    return contentItem.heading;
  } else if ('lineBreak' in contentItem && contentItem.lineBreak) {
    return '\n';
  } else {
    return '';
  }
}

const UNICODE_DASH_CLASS = '\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212\\uFE58\\uFE63\\uFF0D';

export const bibleVerseRegex = new RegExp(
  `\\b(?!In\\b)(?:[1-3]\\s)?(?!In\\b)[A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)*\\s+\\d+:\\d+(?:[${UNICODE_DASH_CLASS}]\\d+|(?:,\\d+)+)*\\b`,
  'g'
);

export const extractReferences = (text: string): string[] => {
  const matches = text.match(bibleVerseRegex);
  return matches
    ? matches.map(ref => ref.trim().replace(/[.,;:]$/, ''))
    : [];
};
