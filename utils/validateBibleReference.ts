// utils/validateBibleReference.ts

import { parseReference, ParsedReference } from "./parseReference";
import { getBookId } from "./bookMappings";

export interface VerseValidationResult {
  isValid: boolean;
  error: string | null;
  parsed: ParsedReference | null;
  bookId: string | null;
}

/**
 * Validates a Bible reference string.
 * Returns validation result with specific error messages.
 *
 * @param reference - The Bible reference to validate (e.g., "Ephesians 6:1")
 * @returns Validation result with isValid, error message, parsed reference, and book ID
 */
export function validateBibleReference(reference: string): VerseValidationResult {
  const trimmed = reference.trim();

  // Empty is valid (optional fields)
  if (!trimmed) {
    return { isValid: true, error: null, parsed: null, bookId: null };
  }

  // Try to parse the reference
  const parsed = parseReference(trimmed);
  if (!parsed) {
    return {
      isValid: false,
      error: "Invalid format. Use: Book Chapter:Verse (e.g., John 6:44)",
      parsed: null,
      bookId: null,
    };
  }

  // Check if the book is recognized
  const bookId = getBookId(parsed.book);
  if (!bookId) {
    return {
      isValid: false,
      error: `Unknown book: "${parsed.book}"`,
      parsed,
      bookId: null,
    };
  }

  return { isValid: true, error: null, parsed, bookId };
}

/**
 * Validates multiple Bible reference fields and returns a record of errors.
 *
 * @param fields - Record of field names to reference values
 * @returns Record of field names to error messages (null if valid)
 */
export function validateBibleReferences(
  fields: Record<string, string | null | undefined>
): Record<string, string | null> {
  const errors: Record<string, string | null> = {};

  for (const [fieldName, value] of Object.entries(fields)) {
    const result = validateBibleReference(value || "");
    errors[fieldName] = result.error;
  }

  return errors;
}

/**
 * Checks if any errors exist in the validation errors record.
 *
 * @param errors - Record of field names to error messages
 * @returns true if any errors exist
 */
export function hasValidationErrors(
  errors: Record<string, string | null>
): boolean {
  return Object.values(errors).some((error) => error !== null);
}
