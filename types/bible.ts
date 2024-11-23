// types/bible.ts

export interface Translation {
    id: string;
    name: string;
    website: string;
    licenseUrl: string;
    shortName: string;
    englishName: string;
    language: string;
    textDirection: string;
    availableFormats: string[];
    listOfBooksApiLink: string;
    numberOfBooks: number;
    totalNumberOfChapters: number;
    totalNumberOfVerses: number;
    languageName: string;
    languageEnglishName: string;
  }
  
  export interface TranslationBook {
    id: string;
    translationId: string;
    name: string;
    commonName: string;
    title: string;
    order: number;
    numberOfChapters: number;
    firstChapterApiLink: string;
    lastChapterApiLink: string;
    totalNumberOfVerses: number;
  }
  
  export interface TranslationBookChapterAudioLinks {
    [reader: string]: string;
  }
  
  export interface ChapterData {
    number: number;
    content: ChapterContent[];
    footnotes: ChapterFootnote[];
  }
  
  export type ChapterContent = ChapterHeading | ChapterLineBreak | ChapterVerse | ChapterHebrewSubtitle;
  
  export interface ChapterHeading {
    type: 'heading';
    content: string[];
  }
  
  export interface ChapterLineBreak {
    type: 'line_break';
  }
  
  export interface ChapterVerse {
    type: 'verse';
    number: number;
    content: VerseContent[];
  }
  
  export interface VerseContent extends FormattedText, InlineHeading, InlineLineBreak, VerseFootnoteReference {}
  
  export interface FormattedText {
    text: string;
    poem?: number;
    wordsOfJesus?: boolean;
  }
  
  export interface InlineHeading {
    heading?: string;
  }
  
  export interface InlineLineBreak {
    lineBreak?: boolean;
  }
  
  export interface VerseFootnoteReference {
    noteId?: number;
  }
  
  export interface ChapterHebrewSubtitle {
    type: 'hebrew_subtitle';
    content: (string | FormattedText | VerseFootnoteReference)[];
  }
  
  export interface ChapterFootnote {
    noteId: number;
    text: string;
    reference?: {
      chapter: number;
      verse: number;
    };
    caller: '+' | string | null;
  }
  
  export interface TranslationBookChapter {
    translation: Translation;
    book: TranslationBook;
    thisChapterLink: string;
    thisChapterAudioLinks: TranslationBookChapterAudioLinks;
    nextChapterApiLink: string | null;
    nextChapterAudioLinks: TranslationBookChapterAudioLinks | null;
    previousChapterApiLink: string | null;
    previousChapterAudioLinks: TranslationBookChapterAudioLinks | null;
    numberOfVerses: number;
    chapter: ChapterData;
  }
  