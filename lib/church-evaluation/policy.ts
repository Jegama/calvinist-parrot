import badgesJson from "../references/badges.json";
import type { CoreDoctrineKey } from "../../types/church";

export type ChurchBadge = keyof typeof badgesJson;

export const EVALUATION_POLICY_VERSION = "2026-07-26";
export const MIN_SOUND_COVERAGE = 0.6;
export const MIN_RECOMMENDED_COVERAGE = 0.8;

export const REQUIRED_ENDORSEMENT_CORE_KEYS = [
  "trinity",
  "gospel",
  "justification_by_faith",
  "christ_deity_humanity",
  "scripture_authority",
  "resurrection_of_jesus",
] as const satisfies readonly CoreDoctrineKey[];

export const CRITICAL_RED_FLAG_BADGES = Object.entries(badgesJson)
  .filter(([, metadata]) => metadata.category === "red_flag")
  .map(([badge]) => badge as ChurchBadge);

export const SECONDARY_DIFFERENCE_BADGES = [
  "🍷 Paedocommunion",
  "🔥 Charismatic",
  "🔄 Dispensational",
  "🧑‍🎓 Wesleyan-Holiness",
  "🧱 KJV-Only",
  "🎯 Seeker-Sensitive",
  "🥖 Real Presence (Lutheran)",
  "🧭 Arminian",
] as const satisfies readonly ChurchBadge[];

export const STRONG_REFORMED_BADGES = [
  "📜 Reformed",
  "📃 Covenant Theology",
] as const satisfies readonly ChurchBadge[];

export const SUPPORTING_REFORMED_BADGES = [
  "📖 Expository Preaching",
  "🎵 Regulative Principle of Worship",
  "👥 Plurality of Elders",
  "📚 Catechism Use",
  "🎶 Exclusive Psalmody",
  "🎼 Instrument-Free Worship",
  "🕯️ High Church/Liturgical",
] as const satisfies readonly ChurchBadge[];

// Kept as a camel-case export for existing Church Finder UI imports.
export const secondaryDifferenceBadges: readonly string[] = SECONDARY_DIFFERENCE_BADGES;
