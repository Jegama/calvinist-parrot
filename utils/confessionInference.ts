import confessionsMap from "@/lib/confessions_map.json";
import type {
  CoreDoctrineMap,
  SecondaryDoctrinesResponse,
} from "@/types/church";
import { CORE_DOCTRINE_KEYS } from "@/lib/schemas/church-finder";

type ConfessionKey = keyof typeof confessionsMap;

/**
 * Apply confession inference to core doctrines.
 * If a confession is adopted, mark all unknown core doctrines as "true"
 * (unless explicitly denied on the website).
 */
export function applyConfessionToCoreDoctrines(
  coreDoctrines: CoreDoctrineMap,
  confessionAdopted: boolean
): CoreDoctrineMap {
  if (!confessionAdopted) {
    return coreDoctrines;
  }

  const updated = { ...coreDoctrines };

  for (const key of CORE_DOCTRINE_KEYS) {
    if (updated[key] === "unknown") {
      updated[key] = "true";
    }
  }

  return updated;
}

/**
 * Apply confession inference to secondary doctrines.
 * If a confession is adopted and a secondary doctrine is null/unknown,
 * fill it with the confession's mapping.
 */
export function applyConfessionToSecondary(
  secondary: SecondaryDoctrinesResponse["secondary"],
  confessionName: string | null,
  confessionAdopted: boolean
): SecondaryDoctrinesResponse["secondary"] {
  if (!confessionAdopted || !confessionName) {
    return secondary;
  }

  const confessionData = confessionsMap[confessionName as ConfessionKey];
  if (!confessionData) {
    return secondary;
  }

  // Helper to check if a value should be replaced
  const shouldReplace = (value: string | null): boolean => {
    if (!value) return true;
    const normalized = value.toLowerCase().trim();
    return normalized === "ambiguous/not stated" ||
      normalized === "mixed/unclear" ||
      normalized === "not stated" ||
      normalized === "ambiguous" ||
      normalized === "unknown" ||
      normalized === "unclear" ||
      normalized === "mixed" ||
      normalized === "null";
  };

  return {
    baptism: shouldReplace(secondary.baptism) ? confessionData.baptism : secondary.baptism,
    governance: shouldReplace(secondary.governance) ? confessionData.governance : secondary.governance,
    lords_supper: shouldReplace(secondary.lords_supper) ? confessionData.lords_supper : secondary.lords_supper,
    gifts: shouldReplace(secondary.gifts) ? confessionData.gifts : secondary.gifts,
    women_in_church: shouldReplace(secondary.women_in_church) ? confessionData.women_in_church : secondary.women_in_church,
    sanctification: shouldReplace(secondary.sanctification) ? confessionData.sanctification : secondary.sanctification,
    continuity: shouldReplace(secondary.continuity) ? confessionData.continuity : secondary.continuity,
    security: shouldReplace(secondary.security) ? confessionData.security : secondary.security,
    atonement_model: shouldReplace(secondary.atonement_model) ? confessionData.atonement_model : secondary.atonement_model,
  };
}
