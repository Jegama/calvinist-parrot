import { filterAllowlistedBadges } from "../../utils/badges";
import type {
  ChurchEvaluationRaw,
  CoreDoctrineMap,
  EvaluationStatus,
} from "../../types/church";
import { CORE_DOCTRINE_KEYS } from "../schemas/church-finder";

import {
  CRITICAL_RED_FLAG_BADGES,
  MIN_RECOMMENDED_COVERAGE,
  MIN_SOUND_COVERAGE,
  REQUIRED_ENDORSEMENT_CORE_KEYS,
  SECONDARY_DIFFERENCE_BADGES,
  STRONG_REFORMED_BADGES,
} from "./policy";

function includesBadge(badges: readonly string[], badge: string): boolean {
  return badges.includes(badge);
}

export type ProcessedChurchEvaluation = {
  normalizedCore: CoreDoctrineMap;
  badges: string[];
  coverageRatio: number;
  coreOnSiteCount: number;
  status: EvaluationStatus;
};

export function postProcessEvaluation(raw: ChurchEvaluationRaw): ProcessedChurchEvaluation {
  const core = raw.church.core_doctrines ?? ({} as CoreDoctrineMap);
  const confessionAdopted = Boolean(raw.church.confession?.adopted);

  const normalizedCore: CoreDoctrineMap = CORE_DOCTRINE_KEYS.reduce((acc, key) => {
    const value = core[key];
    acc[key] = value === "true" || value === "false" || value === "unknown"
      ? value
      : "unknown";
    return acc;
  }, {} as CoreDoctrineMap);

  const llmBadges = Array.isArray(raw.church.badges)
    ? [...new Set(raw.church.badges)]
    : [];

  const trueCount = CORE_DOCTRINE_KEYS.filter((key) => normalizedCore[key] === "true").length;
  const falseCount = CORE_DOCTRINE_KEYS.filter((key) => normalizedCore[key] === "false").length;
  const coverageRatio = CORE_DOCTRINE_KEYS.length === 0
    ? 0
    : trueCount / CORE_DOCTRINE_KEYS.length;

  const hasRequiredCoreAffirmations = REQUIRED_ENDORSEMENT_CORE_KEYS.every(
    (key) => normalizedCore[key] === "true",
  );

  const computedBadges: string[] = [];

  if (confessionAdopted && !llmBadges.includes("📜 Reformed")) {
    computedBadges.push("📜 Reformed");
  }

  if (normalizedCore.trinity === "false") {
    computedBadges.push("⚠️ Non-Trinitarian");
  }
  if (normalizedCore.scripture_authority === "false") {
    computedBadges.push("⚠️ Denies Inerrancy of Scripture");
  }
  if (normalizedCore.justification_by_faith === "false") {
    computedBadges.push("⚠️ Works-Based Justification");
  }
  if (normalizedCore.return_and_judgment === "false") {
    computedBadges.push("⚠️ Universalism");
  }

  const lacksEndorsementDetail =
    !confessionAdopted &&
    (coverageRatio < MIN_SOUND_COVERAGE || !hasRequiredCoreAffirmations);

  if (lacksEndorsementDetail) {
    computedBadges.push("⚠️ Low Essentials Coverage");
  }

  const beliefsUrl = raw.church.best_pages_for?.beliefs ?? null;
  const confessionName = raw.church.confession?.name ?? null;

  if (
    !beliefsUrl &&
    !confessionName &&
    !confessionAdopted &&
    !llmBadges.includes("ℹ️ No Statement of Faith")
  ) {
    computedBadges.push("ℹ️ No Statement of Faith");
  }

  if (
    lacksEndorsementDetail &&
    !llmBadges.includes("ℹ️ Minimal Doctrinal Detail")
  ) {
    computedBadges.push("ℹ️ Minimal Doctrinal Detail");
  }

  const allBadges = filterAllowlistedBadges([
    ...new Set([...computedBadges, ...llmBadges]),
  ]);

  const hasCriticalRedFlag = allBadges.some((badge) =>
    includesBadge(CRITICAL_RED_FLAG_BADGES, badge)
  );
  const hasSecondaryDifferences = allBadges.some((badge) =>
    includesBadge(SECONDARY_DIFFERENCE_BADGES, badge)
  );
  const hasStrongReformedEvidence =
    confessionAdopted ||
    allBadges.some((badge) => includesBadge(STRONG_REFORMED_BADGES, badge));

  let status: EvaluationStatus;

  if (falseCount > 0 || hasCriticalRedFlag) {
    status = "not_endorsed";
  } else if (
    coverageRatio < MIN_SOUND_COVERAGE ||
    !hasRequiredCoreAffirmations
  ) {
    status = "limited_information";
  } else if (
    coverageRatio >= MIN_RECOMMENDED_COVERAGE &&
    hasStrongReformedEvidence &&
    !hasSecondaryDifferences
  ) {
    status = "recommended";
  } else {
    status = "biblically_sound_with_differences";
  }

  return {
    normalizedCore,
    badges: allBadges,
    coverageRatio,
    coreOnSiteCount: trueCount,
    status,
  };
}
