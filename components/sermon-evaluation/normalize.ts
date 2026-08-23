import {
  SERMON_AGGREGATES,
  SERMON_RUBRIC_SECTIONS,
} from "@/lib/sermon-evaluation/rubric.generated";
import type {
  SermonEvaluationDetail,
  SermonRubricSection,
  SermonStructurePoint,
} from "./types";

type JsonRecord = Record<string, unknown>;

type NormalizedSermonResult = Pick<
  SermonEvaluationDetail,
  | "aggregateScores"
  | "aggregateFeedback"
  | "doctrinalGate"
  | "rubricSections"
  | "scoringConfidence"
  | "structure"
  | "coaching"
>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  return asArray(value)
    .map((item) => asString(item))
    .filter((item): item is string => item !== null);
}

function readCanonicalRubric(scoring: JsonRecord): SermonRubricSection[] {
  const hasCanonicalSection = SERMON_RUBRIC_SECTIONS.some(
    ({ key }) => Object.keys(asRecord(scoring[key])).length > 0,
  );
  if (!hasCanonicalSection) {
    return [];
  }
  return SERMON_RUBRIC_SECTIONS.flatMap(({ key, label, criteria }) => {
    const section = asRecord(scoring[key]);
    if (Object.keys(section).length === 0) {
      return [];
    }
    return [{
      key,
      label,
      score: asNumber(section.Overall),
      feedback: asString(section.Feedback),
      subcriteria: criteria.map((criterion) => ({
        key: criterion.key,
        label: criterion.label,
        score: asNumber(section[criterion.key]),
      })),
    }];
  });
}

function readGenericRubric(root: JsonRecord): SermonRubricSection[] {
  const rubric = asRecord(root.rubric);
  return asArray(root.rubricSections ?? root.sections ?? rubric.sections).map(
    (sectionValue, sectionIndex) => {
      const section = asRecord(sectionValue);
      return {
        key:
          asString(section.key ?? section.id) ?? `section-${sectionIndex + 1}`,
        label:
          asString(section.label ?? section.name ?? section.title) ??
          `Section ${sectionIndex + 1}`,
        score: asNumber(section.score),
        feedback: asString(section.feedback ?? section.comments),
        subcriteria: asArray(section.subcriteria ?? section.criteria).map(
          (criterionValue, criterionIndex) => {
            const criterion = asRecord(criterionValue);
            return {
              key:
                asString(criterion.key ?? criterion.id) ??
                `criterion-${sectionIndex + 1}-${criterionIndex + 1}`,
              label:
                asString(
                  criterion.label ?? criterion.name ?? criterion.title,
                ) ?? `Criterion ${criterionIndex + 1}`,
              score: asNumber(criterion.score),
              feedback: asString(
                criterion.feedback ?? criterion.comments,
              ),
            };
          },
        ),
      };
    },
  );
}

function readCanonicalPoint(value: unknown, index: number): SermonStructurePoint {
  const point = asRecord(value);
  return {
    heading: asString(point.Point) ?? `Point ${index + 1}`,
    summary: asString(point.Summary),
    scriptures: readStrings(point.Verses),
    subpoints: readStrings(point.Subpoints),
    applications: readStrings(point.Application),
    illustrations: readStrings(point.Illustrations),
    comments: asString(point.Comments),
    feedback: asString(point.Feedback),
  };
}

function readGenericPoint(value: unknown, index: number): SermonStructurePoint {
  const point = asRecord(value);
  return {
    heading:
      asString(point.heading ?? point.title ?? point.point) ??
      `Point ${index + 1}`,
    summary: asString(point.summary ?? point.description),
    scriptures: readStrings(point.scriptures ?? point.scripture),
    subpoints: readStrings(point.subpoints),
    applications: readStrings(point.applications),
    illustrations: readStrings(point.illustrations),
    comments: asString(point.comments),
    feedback: asString(point.feedback),
  };
}

export function normalizeSermonResult(value: unknown): NormalizedSermonResult {
  const root = asRecord(value);
  const extraction = asRecord(
    root.extraction ?? root.structure ?? root.step1,
  );
  const scoring = asRecord(root.scoring);
  const summary = asRecord(
    scoring.Aggregated_Summary ??
      root.aggregateScores ??
      root.aggregates ??
      root.scores,
  );
  const summaryFeedback = asRecord(scoring.Aggregated_Summary_Feedback);
  const doctrinalFidelity = asRecord(scoring.Doctrinal_Fidelity);

  const aggregateScores: Record<string, number> = {};
  const aggregateFeedback: Record<string, string> = {};
  for (const { key: canonicalKey, clientKey } of SERMON_AGGREGATES) {
    const score = asNumber(summary[canonicalKey] ?? summary[clientKey]);
    if (score !== null) {
      aggregateScores[clientKey] = score;
    }
    const feedback = asString(
      summaryFeedback[canonicalKey] ?? summaryFeedback[clientKey],
    );
    if (feedback) {
      aggregateFeedback[clientKey] = feedback;
    }
  }

  if (Object.keys(aggregateScores).length === 0) {
    for (const [key, entry] of Object.entries(summary)) {
      const score = asNumber(entry);
      if (score !== null) {
        aggregateScores[key] = score;
      }
    }
  }

  const canonicalPoints = asArray(extraction.Body).map(readCanonicalPoint);
  const points =
    canonicalPoints.length > 0
      ? canonicalPoints
      : asArray(extraction.points ?? extraction.sermonPoints).map(
          readGenericPoint,
        );
  const fallenCondition = asRecord(extraction.Fallen_Condition_Focus);
  const generalComments = asRecord(extraction.General_Comments);
  const coaching = asRecord(root.coaching ?? root.feedback);
  const rubricSections = readCanonicalRubric(scoring);

  return {
    aggregateScores,
    aggregateFeedback,
    doctrinalGate: {
      status:
        doctrinalFidelity.Core_Doctrine_Gate === "PASS" ||
        doctrinalFidelity.Core_Doctrine_Gate === "FAIL"
          ? doctrinalFidelity.Core_Doctrine_Gate
          : null,
      reason: asString(doctrinalFidelity.Gate_Reason),
    },
    rubricSections:
      rubricSections.length > 0 ? rubricSections : readGenericRubric(root),
    scoringConfidence: asNumber(
      scoring.Scoring_Confidence ??
        scoring.scoringConfidence ??
        root.scoringConfidence,
    ),
    structure: {
      scriptureIntroduction: asString(
        extraction.Scripture_Introduction ??
          extraction.scriptureIntroduction,
      ),
      sermonIntroduction: asString(
        extraction.Sermon_Introduction ?? extraction.sermonIntroduction,
      ),
      proposition: asString(
        extraction.Proposition ??
          extraction.proposition ??
          extraction.mainProposition,
      ),
      fallenConditionFocus: asString(
        fallenCondition.FCF ??
          extraction.fallenConditionFocus ??
          extraction.fcf,
      ),
      fallenConditionComments: asString(
        fallenCondition.Comments ?? extraction.fallenConditionComments,
      ),
      conclusion: asString(extraction.Conclusion ?? extraction.conclusion),
      extractionConfidence: asNumber(
        extraction.Extraction_Confidence ??
          extraction.extractionConfidence ??
          extraction.confidence,
      ),
      points,
      applications:
        canonicalPoints.length > 0
          ? canonicalPoints.flatMap((point) => point.applications ?? [])
          : readStrings(extraction.applications),
      illustrations:
        canonicalPoints.length > 0
          ? canonicalPoints.flatMap((point) => point.illustrations ?? [])
          : readStrings(extraction.illustrations),
      comments: asString(extraction.comments),
      generalComments: {
        content: asString(
          generalComments.Content_Comments ?? generalComments.content,
        ),
        structure: asString(
          generalComments.Structure_Comments ?? generalComments.structure,
        ),
        explanation: asString(
          generalComments.Explanation_Comments ??
            generalComments.explanation,
        ),
      },
    },
    coaching: {
      summary: asString(
        summaryFeedback.Overall_Impact ??
          coaching.summary ??
          coaching.overall,
      ),
      strengths: readStrings(scoring.Strengths ?? coaching.strengths),
      growthAreas: readStrings(
        scoring.Growth_Areas ??
          coaching.growthAreas ??
          coaching.growth_areas,
      ),
      nextSteps: readStrings(
        scoring.Next_Steps ?? coaching.nextSteps ?? coaching.next_steps,
      ),
    },
  };
}
