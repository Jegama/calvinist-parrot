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
  | "rubricSections"
  | "scoringConfidence"
  | "structure"
  | "coaching"
>;

const AGGREGATE_FIELDS = [
  ["Textual_Fidelity", "textualFidelity"],
  ["Proposition_Clarity", "propositionClarity"],
  ["Introduction", "introduction"],
  ["Application_Effectiveness", "applicationEffectiveness"],
  ["Structure_Cohesion", "structureCohesion"],
  ["Illustrations", "illustrations"],
] as const;

const RUBRIC_SECTIONS = [
  {
    key: "Introduction",
    criteria: ["FCF_Introduced", "Arouses_Attention"],
  },
  {
    key: "Proposition",
    criteria: [
      "Principle_and_Application_Wed",
      "Establishes_Main_Theme",
      "Summarizes_Introduction",
    ],
  },
  {
    key: "Main_Points",
    criteria: [
      "Clarity",
      "Hortatory_Universal_Truths",
      "Proportional_and_Coexistent",
      "Exposition_Quality",
      "Illustration_Quality",
      "Application_Quality",
    ],
  },
  {
    key: "Exegetical_Support",
    criteria: [
      "Alignment_with_Text",
      "Handles_Difficulties",
      "Proof_Accuracy_and_Clarity",
      "Context_and_Genre_Considered",
      "Not_Belabored",
      "Aids_Rather_Than_Impresses",
    ],
  },
  {
    key: "Application",
    criteria: [
      "Clear_and_Practical",
      "Redemptive_Focus",
      "Mandate_vs_Idea_Distinction",
      "Passage_Supported",
    ],
  },
  {
    key: "Illustrations",
    criteria: ["Lived_Body_Detail", "Strengthens_Points", "Proportion"],
  },
  {
    key: "Conclusion",
    criteria: ["Summary", "Compelling_Exhortation", "Climax", "Pointed_End"],
  },
] as const;

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

function humanize(value: string): string {
  return value
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readCanonicalRubric(scoring: JsonRecord): SermonRubricSection[] {
  const hasCanonicalSection = RUBRIC_SECTIONS.some(
    ({ key }) => Object.keys(asRecord(scoring[key])).length > 0,
  );
  if (!hasCanonicalSection) {
    return [];
  }
  return RUBRIC_SECTIONS.map(({ key, criteria }) => {
    const section = asRecord(scoring[key]);
    return {
      key,
      label: humanize(key),
      score: asNumber(section.Overall),
      feedback: asString(section.Feedback),
      subcriteria: criteria.map((criterion) => ({
        key: criterion,
        label: humanize(criterion),
        score: asNumber(section[criterion]),
      })),
    };
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

  const aggregateScores: Record<string, number> = {};
  const aggregateFeedback: Record<string, string> = {};
  for (const [canonicalKey, clientKey] of AGGREGATE_FIELDS) {
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
