import badgesJson from "@/lib/references/badges.json";

/**
 * Filter a list of badges to the canonical allowlist from badges.json.
 * - Preserves input order
 * - Removes duplicates
 * - Drops unknown/typo badges
 */
export function filterAllowlistedBadges(badges: Array<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(badges)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of badges) {
    if (typeof raw !== "string") continue;
    const badge = raw.trim();
    if (!badge) continue;
    // Only include if verbatim key exists in registry
    if (Object.prototype.hasOwnProperty.call(badgesJson, badge) && !seen.has(badge)) {
      seen.add(badge);
      out.push(badge);
    }
  }
  return out;
}

/**
 * Type-safe check whether a badge is known.
 */
export function isKnownBadge(badge: string): boolean {
  return Object.prototype.hasOwnProperty.call(badgesJson, badge);
}
