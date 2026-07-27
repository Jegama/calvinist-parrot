/**
 * Compatibility facade for existing imports. New church-evaluation code belongs
 * in the feature-focused modules under lib/church-evaluation.
 */
export {
  crawlChurchSite,
  dropAnchorDupes,
  extractChurchEvaluation,
  geocodeAddress,
  postProcessEvaluation,
  toCoreDoctrineStatusEnum,
  toEvaluationStatusEnum,
  type ChurchSourcePage,
  type ProcessedChurchEvaluation,
  type TavilyCrawlResult,
} from "@/lib/church-evaluation";
