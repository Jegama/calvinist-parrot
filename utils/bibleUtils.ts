// utils/bibleUtils.ts

import { getBookId } from '@/utils/bookMappings';
import { VerseContent } from '@/types/bible';

type CommentaryCacheKey = string;
const commentaryCache = new Map<CommentaryCacheKey, string>();
const commentaryInflight = new Map<CommentaryCacheKey, Promise<string>>();

export async function getBibleCommentary(
    commentaryId: string,
    book: string,
    chapter: number,
    verses?: number | number[]
  ): Promise<string> {
    try {
        const bookId = getBookId(book);
    if (!bookId) {
      return 'Unknown book';
        }

    const key: CommentaryCacheKey = `${commentaryId}:${bookId}:${chapter}:${JSON.stringify(verses ?? null)}`;
    const cached = commentaryCache.get(key);
    if (cached) {
      return cached;
    }

    let inflight = commentaryInflight.get(key);
    if (!inflight) {
      inflight = fetch(`https://bible.helloao.org/api/c/${commentaryId}/${bookId}/${chapter}.json`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Error fetching commentary: ${response.statusText}`);
          }
          return response.json();
        })
        .then((data) => {
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

          commentaryCache.set(key, commentaryText);
          commentaryInflight.delete(key);
          return commentaryText;
        })
        .catch((error) => {
          commentaryInflight.delete(key);
          throw error;
        });
      commentaryInflight.set(key, inflight);
    }

    return await inflight;
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
