export const AUTH_IDENTIFIER_MAX_LENGTH = 320;
export const USERNAME_PATTERN = "[A-Za-z0-9_]{3,32}";
export const USERNAME_HINT = "Use 3–32 letters (A–Z), numbers, or underscores.";
export const PROFILE_NAME_MAX_LENGTH = 64;

const usernamePattern = new RegExp(`^${USERNAME_PATTERN}$`);

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  return usernamePattern.test(username) ? username.toLowerCase() : null;
}

export function normalizeProfileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= PROFILE_NAME_MAX_LENGTH && !name.includes("\0") ? name : null;
}
