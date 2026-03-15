// utils/commentaryService.ts

import { parseReference } from "@/utils/parseReference";
import { getBookId, isOldTestament, getCanonicalBookNameFromId } from "@/utils/bookMappings";
import { extractCommentary, formatCommentary, CommentaryResponse } from "@/utils/commentaryHelpers";

const BIBLE_API_BASE_URL = "https://bible.helloao.org";

/** Available commentary sources with metadata */
export const COMMENTARY_REGISTRY: Record<string, { name: string; otOnly: boolean }> = {
  "adam-clarke":            { name: "Adam Clarke",       otOnly: false },
  "keil-delitzsch":         { name: "Keil & Delitzsch",  otOnly: true  },
  "jamieson-fausset-brown": { name: "JFB",               otOnly: false },
  "john-gill":              { name: "John Gill",          otOnly: false },
  "matthew-henry":          { name: "Matthew Henry",      otOnly: false },
  "tyndale":                { name: "Tyndale",            otOnly: false },
};

/**
 * Given an array of Bible passage references, this function fetches and returns
 * the formatted commentary text for each passage from the specified commentaries.
 *
 * @param passages - An array of Bible reference strings (e.g., "John 6:44").
 * @param commentaryIds - An array of commentary IDs to fetch. Defaults to ["matthew-henry"].
 * @returns A promise that resolves to an object where each key is the original passage
 *          and its value is the formatted commentary text or an error message.
 */
export async function getCommentariesForPassages(
  passages: string[],
  commentaryIds: string[] = ["matthew-henry"]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const passage of passages) {
    // Parse the reference string into its components
    const parsed = parseReference(passage);
    if (!parsed) {
      results[passage] = "Invalid reference";
      continue;
    }

    const { book, chapter } = parsed;
    const bookId = getBookId(book);
    if (!bookId) {
      results[passage] = "Unknown book";
      continue;
    }

    // Filter valid commentary IDs and handle OT-only restrictions
    const validIds = commentaryIds.filter((id) => {
      const entry = COMMENTARY_REGISTRY[id];
      if (!entry) return false;
      if (entry.otOnly && !isOldTestament(bookId)) return false;
      return true;
    });

    if (validIds.length === 0) {
      // Build a helpful message about why no commentaries matched
      const otOnlyRequested = commentaryIds.filter(
        (id) => COMMENTARY_REGISTRY[id]?.otOnly && !isOldTestament(bookId)
      );
      if (otOnlyRequested.length > 0) {
        results[passage] = `${otOnlyRequested.map((id) => COMMENTARY_REGISTRY[id]?.name).join(", ")} only cover${otOnlyRequested.length === 1 ? "s" : ""} the Old Testament. "${passage}" is a New Testament passage. Try john-gill or jamieson-fausset-brown instead.`;
      } else {
        results[passage] = "No valid commentary IDs provided";
      }
      continue;
    }

    // Fetch commentaries in parallel (cap at 3 concurrent via chunking)
    const chunkSize = 3;
    const commentaryResults: string[] = [];

    for (let i = 0; i < validIds.length; i += chunkSize) {
      const chunk = validIds.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (commentaryId) => {
          const entry = COMMENTARY_REGISTRY[commentaryId]!;
          try {
            const response = await fetch(
              `${BIBLE_API_BASE_URL}/api/c/${commentaryId}/${bookId}/${chapter}.json`
            );
            if (!response.ok) {
              return `[${entry.name}] Error fetching commentary (HTTP ${response.status})`;
            }
            const data: CommentaryResponse = await response.json();
            const commentaryData = extractCommentary(data, parsed);
            return formatCommentary(commentaryData, passage, entry.name);
          } catch (error) {
            console.error(`Error fetching ${entry.name} commentary for`, passage, error);
            return `[${entry.name}] Error loading commentary`;
          }
        })
      );
      commentaryResults.push(...chunkResults);
    }

    results[passage] = commentaryResults.join("\n\n---\n\n");
  }

  return results;
}

/**
 * Fetches cross-references for an array of Bible passages from the Open Cross References dataset.
 *
 * @param passages - An array of Bible reference strings (e.g., "Romans 8:28").
 * @returns A promise that resolves to an object where each key is the original passage
 *          and its value is the formatted cross-reference list.
 */
export async function getCrossReferences(
  passages: string[]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  const formatReference = (ref: { book: string; chapter: number; verse: number; endVerse?: number }) => {
    const canonicalBookName = getCanonicalBookNameFromId(ref.book) || ref.book;
    const versePart = typeof ref.endVerse === "number" && ref.endVerse > ref.verse
      ? `${ref.verse}-${ref.endVerse}`
      : `${ref.verse}`;
    return `${canonicalBookName} ${ref.chapter}:${versePart}`;
  };

  for (const passage of passages) {
    const parsed = parseReference(passage);
    if (!parsed) {
      results[passage] = "Invalid reference";
      continue;
    }

    const { book, chapter, verses } = parsed;
    const bookId = getBookId(book);
    if (!bookId) {
      results[passage] = "Unknown book";
      continue;
    }

    try {
      const response = await fetch(
        `${BIBLE_API_BASE_URL}/api/d/open-cross-ref/${bookId}/${chapter}.json`
      );
      if (!response.ok) {
        results[passage] = "Error fetching cross-references";
        continue;
      }

      const data = await response.json();

      // Determine which verses to filter for
      let targetVerses: number[] = [];
      if (verses) {
        switch (verses.type) {
          case "single":
            targetVerses = [verses.verse];
            break;
          case "range":
            for (let v = verses.start; v <= verses.end; v++) {
              targetVerses.push(v);
            }
            break;
          case "list":
            targetVerses = verses.verses;
            break;
        }
      }

      // Extract cross-references from the chapter data.
      // open-cross-ref returns: { chapter: { content: [ { verse, references: [...] } ] } }
      const content = data?.chapter?.content;
      if (!Array.isArray(content) || content.length === 0) {
        results[passage] = `No cross-references found for ${passage}.`;
        continue;
      }

      const crossRefs: string[] = [];
      for (const item of content as Array<Record<string, unknown>>) {
        const verseNumber = typeof item.verse === "number"
          ? item.verse
          : typeof item.number === "number"
            ? item.number
            : null;

        if (!verseNumber) {
          continue;
        }

        // If specific verses requested, filter
        if (targetVerses.length > 0 && !targetVerses.includes(verseNumber)) {
          continue;
        }

        const referencesRaw = Array.isArray(item.references)
          ? item.references
          : Array.isArray(item.content)
            ? item.content
            : [];

        const formattedRefs = referencesRaw
          .filter((ref): ref is { book: string; chapter: number; verse: number; endVerse?: number } => {
            if (!ref || typeof ref !== "object") return false;
            const row = ref as Record<string, unknown>;
            return (
              typeof row.book === "string" &&
              typeof row.chapter === "number" &&
              typeof row.verse === "number"
            );
          })
          .slice(0, 20)
          .map((ref) => formatReference(ref));

        if (formattedRefs.length > 0) {
          crossRefs.push(
            `**${book} ${chapter}:${verseNumber}** → ${formattedRefs.join("; ")}`
          );
        }
      }

      if (crossRefs.length === 0) {
        results[passage] = `No cross-references found for ${passage}.`;
      } else {
        results[passage] = `Cross-references for ${passage}:\n\n${crossRefs.join("\n")}`;
      }
    } catch (error) {
      console.error("Error fetching cross-references for", passage, error);
      results[passage] = "Error loading cross-references";
    }
  }

  return results;
}
