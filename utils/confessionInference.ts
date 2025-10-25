import confessionsMap from "@/lib/confessions_map.json";
import type {
  CoreDoctrineMap,
  SecondaryDoctrinesResponse,
  TertiaryDoctrinesResponse,
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

  return {
    baptism: secondary.baptism || confessionData.baptism,
    governance: secondary.governance || confessionData.governance,
    lords_supper: secondary.lords_supper || confessionData.lords_supper,
    gifts: secondary.gifts || confessionData.gifts,
    women_in_church: secondary.women_in_church || confessionData.women_in_church,
    sanctification: secondary.sanctification || confessionData.sanctification,
    continuity: secondary.continuity || confessionData.continuity,
    security: secondary.security || confessionData.security,
    atonement_model: secondary.atonement_model || confessionData.atonement_model,
  };
}

/**
 * Tertiary doctrines are typically not defined in historic confessions,
 * so we don't infer them. This function is a no-op for now but included
 * for consistency.
 */
export function applyConfessionToTertiary(
  tertiary: TertiaryDoctrinesResponse["tertiary"],
  _confessionName: string | null,
  _confessionAdopted: boolean
): TertiaryDoctrinesResponse["tertiary"] {
  // No inference for tertiary doctrines from confessions
  return tertiary;
}
