// utils/parseReference.ts

export interface ParsedReference {
    book: string;
    chapter: number;
    verses: number[] | [number, number]; // Handle ranges as well
  }
  
  export function parseReference(reference: string): ParsedReference | null {
    try {
      // Split book and the rest
      const [bookChapter, versePart] = reference.split(':');
      const bookChapterParts = bookChapter.trim().split(' ');
      let book = '';
      let chapterStr = '';
  
      if (bookChapterParts.length === 1) {
        // Book and chapter are together
        [book, chapterStr] = bookChapterParts[0].match(/([^\d]+)(\d+)/)!.slice(1);
      } else {
        // Book and chapter are separate
        book = bookChapterParts.slice(0, -1).join(' ');
        chapterStr = bookChapterParts[bookChapterParts.length - 1];
      }
  
      const chapter = parseInt(chapterStr, 10);
  
      // Parse verses
      let verses: number[] | [number, number];
  
      if (versePart) {
        // Handle ranges and lists
        if (versePart.includes('-')) {
          // Range of verses
          const [start, end] = versePart.split('-').map(v => parseInt(v.trim(), 10));
          verses = [start, end];
        } else if (versePart.includes(',')) {
          // List of verses
          verses = versePart.split(',').map(v => parseInt(v.trim(), 10));
        } else {
          verses = [parseInt(versePart.trim(), 10)];
        }
      } else {
        verses = []; // Whole chapter
      }
  
      return { book: book.trim(), chapter, verses };
    } catch (error) {
      console.error('Error parsing reference:', error);
      return null;
    }
  }
  