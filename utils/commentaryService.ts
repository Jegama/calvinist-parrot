import { parseReference } from "@/utils/parseReference";
import { getBookId } from "@/utils/bookMappings";
import { extractCommentary, formatCommentary, CommentaryResponse } from "@/utils/commentaryHelpers";

/**
 * Given an array of Bible passage references, this function fetches and returns
 * the formatted commentary text for each passage.
 *
 * @param passages - An array of Bible reference strings (e.g., "John 3:16").
 * @returns A promise that resolves to an object where each key is the original passage
 *          and its value is the formatted commentary text or an error message.
 */
export async function getCommentariesForPassages(
  passages: string[]
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

    try {
      // Fetch the commentary JSON data for the book and chapter
      const response = await fetch(`/api/c/matthew-henry/${bookId}/${chapter}.json`);
      if (!response.ok) {
        results[passage] = "Error fetching commentary";
        continue;
      }

      const data: CommentaryResponse = await response.json();
      // Extract commentary data based on the parsed reference
      const commentaryData = extractCommentary(data, parsed);
      // Format the commentary text as desired
      const formattedCommentary = formatCommentary(commentaryData, passage);
      results[passage] = formattedCommentary;
    } catch (error) {
      console.error("Error fetching commentary for", passage, error);
      results[passage] = "Error loading commentary";
    }
  }

  return results;
}
