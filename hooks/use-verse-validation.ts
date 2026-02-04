// hooks/use-verse-validation.ts

import { useState, useEffect, useRef, useCallback } from "react";
import {
  validateBibleReference,
  hasValidationErrors,
} from "@/utils/validateBibleReference";

const DEBOUNCE_DELAY = 300; // ms

/**
 * Hook for debounced Bible verse validation across multiple fields.
 * Provides real-time validation feedback with a 300ms debounce.
 *
 * @returns Object with verseErrors record, validateField function, and hasErrors boolean
 */
export function useVerseValidation() {
  const [verseErrors, setVerseErrors] = useState<Record<string, string | null>>(
    {}
  );
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const validateField = useCallback((fieldName: string, value: string) => {
    // Clear existing timer for this field
    if (timersRef.current[fieldName]) {
      clearTimeout(timersRef.current[fieldName]);
    }

    // If empty, clear error immediately (no debounce needed)
    if (!value.trim()) {
      setVerseErrors((prev) => ({ ...prev, [fieldName]: null }));
      return;
    }

    // Debounce the validation
    timersRef.current[fieldName] = setTimeout(() => {
      const result = validateBibleReference(value);
      setVerseErrors((prev) => ({ ...prev, [fieldName]: result.error }));
    }, DEBOUNCE_DELAY);
  }, []);

  const clearErrors = useCallback(() => {
    setVerseErrors({});
  }, []);

  const hasErrors = hasValidationErrors(verseErrors);

  return {
    verseErrors,
    validateField,
    clearErrors,
    hasErrors,
  };
}
