// utils/ageUtils.ts
// Age calculation utilities for Kids Discipleship and member display.
// Based on Dr. Gifford's Four Elements of Discipleship framework.

export type AgeBracket =
  | "INFANT_TODDLER" // 0-3 years
  | "EARLY_CHILDHOOD" // 3-6 years
  | "MIDDLE_CHILDHOOD" // 7-12 years
  | "ADOLESCENCE"; // 13-17 years

export const AGE_BRACKET_CONFIG: Record<
  AgeBracket,
  { min: number; max: number; label: string; description: string }
> = {
  INFANT_TODDLER: {
    min: 0,
    max: 3,
    label: "Infant/Toddler",
    description:
      "Focus on authority, atmosphere, simple habits. Heavy parental input, low child output.",
  },
  EARLY_CHILDHOOD: {
    min: 3,
    max: 6,
    label: "Early Childhood",
    description:
      "Begin introducing responsibility, simple obedience explanations.",
  },
  MIDDLE_CHILDHOOD: {
    min: 7,
    max: 12,
    label: "Middle Childhood",
    description:
      "Growing independence, more complex character work, academic competencies.",
  },
  ADOLESCENCE: {
    min: 13,
    max: 17,
    label: "Adolescence",
    description:
      "Preparing for adulthood, increased autonomy, deeper theological discussions.",
  },
};

/**
 * Calculate age from birthdate.
 * Returns years and months since birth.
 */
export function calculateAge(birthdate: string | Date): {
  years: number;
  months: number;
} {
  const birth = typeof birthdate === "string" ? new Date(birthdate) : birthdate;
  const now = new Date();

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();

  if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }
  if (now.getDate() < birth.getDate()) {
    months--;
    if (months < 0) months += 12;
  }

  return { years: Math.max(0, years), months: Math.max(0, months) };
}

/**
 * Get age bracket for a birthdate. Returns null if age >= 18 or invalid.
 */
export function getAgeBracket(birthdate: string | Date): AgeBracket | null {
  const { years } = calculateAge(birthdate);

  if (years < 0 || years >= 18) return null;
  if (years <= 3) return "INFANT_TODDLER";
  if (years <= 6) return "EARLY_CHILDHOOD";
  if (years <= 12) return "MIDDLE_CHILDHOOD";
  return "ADOLESCENCE";
}

/**
 * Format age for display (e.g., "7 months", "2 years", "2 years 3 months").
 */
export function formatAge(birthdate: string | Date): string {
  const { years, months } = calculateAge(birthdate);

  if (years === 0) {
    return months === 1 ? "1 month" : `${months} months`;
  }
  if (months === 0) {
    return years === 1 ? "1 year" : `${years} years`;
  }
  const yearStr = years === 1 ? "1 year" : `${years} years`;
  const monthStr = months === 1 ? "1 month" : `${months} months`;
  return `${yearStr} ${monthStr}`;
}

/**
 * Get bracket label for display (e.g., "Infant/Toddler").
 */
export function getBracketLabel(bracket: AgeBracket): string {
  return AGE_BRACKET_CONFIG[bracket].label;
}

/**
 * Get bracket description for tooltips or expanded views.
 */
export function getBracketDescription(bracket: AgeBracket): string {
  return AGE_BRACKET_CONFIG[bracket].description;
}

/**
 * Check if a birthdate is valid for age calculation.
 */
export function isValidBirthdate(birthdate: string | Date): boolean {
  const date =
    typeof birthdate === "string" ? new Date(birthdate) : birthdate;
  return !isNaN(date.getTime()) && date <= new Date();
}

/**
 * Parse and validate a birthdate string (ISO 8601 format).
 * Returns the Date object if valid, null otherwise.
 */
export function parseBirthdate(birthdate: string): Date | null {
  // Accept ISO 8601 date strings (YYYY-MM-DD or full datetime)
  const date = new Date(birthdate);
  if (isNaN(date.getTime())) return null;
  if (date > new Date()) return null; // Can't be born in the future
  return date;
}
