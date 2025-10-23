import { Family, Member, NewFamilyFormState, NewPersonalFormState } from "./types";

export const defaultCategories = [
  "Church Friends",
  "Neighbors",
  "Extended Family",
  "Missionaries",
  "Coworkers",
];

export function formatRelative(dateString?: string | null) {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatTimeSince(dateString?: string | null) {
  if (!dateString) return "Not yet";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not yet";
  
  // Compare calendar dates, not just time difference
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const prayerDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - prayerDate.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const days = Math.round(diffMs / dayMs);
  
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function determineNextMemberId(family: Family, members: Member[]): string | undefined {
  if (!members.length) return undefined;
  if (members.length === 1) return members[0].id;
  const lastId = family.lastPrayedByMemberId;
  if (!lastId) return members[0].id;
  const next = members.find((member) => member.id !== lastId);
  return next?.id ?? members[0].id;
}

export function normalizeChildren(input: string) {
  return input
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function appendUserId(path: string, userId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}userId=${encodeURIComponent(userId)}`;
}

export async function readErrorMessage(response: Response) {
  try {
    const data = await response.json();
    if (data && typeof data.error === "string" && data.error.trim().length) {
      return data.error.trim();
    }
  } catch {
    // ignore json parse issues
  }
  if (response.status >= 500) return "Unexpected server error. Please try again.";
  return "Unable to process this request right now.";
}

/**
 * Resolves the final category tag from form state.
 * Returns empty string if "none" is selected or if custom is selected but empty.
 */
export function resolveCategoryTag(categorySelect: string, customCategory: string): string {
  const trimmedCustom = customCategory.trim();
  if (categorySelect === "__custom") {
    return trimmedCustom;
  }
  if (categorySelect === "none") {
    return "";
  }
  return categorySelect;
}

/**
 * Validates family form data.
 * Returns error message string if invalid, null if valid.
 */
export function validateFamilyForm(form: NewFamilyFormState): string | null {
  const trimmedName = form.familyName.trim();
  if (!trimmedName) {
    return "Family name is required.";
  }

  const resolvedCategory = resolveCategoryTag(form.categorySelect, form.customCategory);
  if (form.categorySelect === "__custom" && !resolvedCategory) {
    return "Please provide a category name.";
  }

  return null;
}

/**
 * Validates personal request form data.
 * Returns error message string if invalid, null if valid.
 */
export function validatePersonalForm(form: NewPersonalFormState): string | null {
  const requestText = form.text.trim();
  if (!requestText) {
    return "Please enter a prayer request.";
  }
  return null;
}

/**
 * Converts a date input value (YYYY-MM-DD) to ISO string.
 * Returns null if empty or invalid.
 */
export function dateInputToIso(dateValue: string): string | null {
  const trimmed = dateValue.trim();
  if (!trimmed) return null;
  
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  
  return parsed.toISOString();
}

/**
 * Converts an ISO date string to date input format (YYYY-MM-DD).
 * Returns empty string if invalid or missing.
 */
export function isoToDateInput(isoString?: string | null): string {
  if (!isoString) return "";
  
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return "";
  
  return parsed.toISOString().slice(0, 10);
}

/**
 * Generic API error handler that extracts error messages and provides fallback.
 */
export async function handleApiError(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const message = await readErrorMessage(response);
  return message || fallbackMessage;
}

/**
 * Builds the payload for creating a new family.
 */
export function buildFamilyPayload(
  userId: string,
  form: NewFamilyFormState
): {
  userId: string;
  familyName: string;
  parents: string;
  children: string[];
  categoryTag?: string;
} {
  const resolvedCategory = resolveCategoryTag(form.categorySelect, form.customCategory);
  
  return {
    userId,
    familyName: form.familyName.trim(),
    parents: form.parents.trim(),
    children: normalizeChildren(form.children),
    categoryTag: resolvedCategory || undefined,
  };
}

/**
 * Builds the payload for creating a new personal request.
 */
export function buildPersonalRequestPayload(
  userId: string,
  form: NewPersonalFormState
): {
  userId: string;
  requestText: string;
  notes?: string;
} {
  return {
    userId,
    requestText: form.text.trim(),
    notes: form.notes.trim() || undefined,
  };
}

/**
 * Resets family form state, optionally preserving the category.
 */
export function resetFamilyForm(
  preserveCategory?: string
): NewFamilyFormState {
  return {
    familyName: "",
    parents: "",
    children: "",
    categorySelect: preserveCategory || "none",
    customCategory: "",
  };
}

/**
 * Resets personal request form state.
 */
export function resetPersonalForm(): NewPersonalFormState {
  return {
    text: "",
    notes: "",
  };
}
