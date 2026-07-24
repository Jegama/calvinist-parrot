export const METRIC_DEFINITIONS = [
  {
    key: "adherenceCore",
    meanColumn: "adherence_core_mean",
    stdevColumn: "adherence_core_stdev",
    criterion: "Adherence",
    subCriterion: "Core",
    label: "Core Doctrine",
    group: "Adherence",
  },
  {
    key: "adherenceSecondary",
    meanColumn: "adherence_secondary_mean",
    stdevColumn: "adherence_secondary_stdev",
    criterion: "Adherence",
    subCriterion: "Secondary",
    label: "Secondary Doctrine",
    group: "Adherence",
  },
  {
    key: "adherenceTertiaryHandling",
    meanColumn: "adherence_tertiary_handling_mean",
    stdevColumn: "adherence_tertiary_handling_stdev",
    criterion: "Adherence",
    subCriterion: "Tertiary_Handling",
    label: "Tertiary Handling",
    group: "Adherence",
  },
  {
    key: "adherenceBiblicalBasis",
    meanColumn: "adherence_biblical_basis_mean",
    stdevColumn: "adherence_biblical_basis_stdev",
    criterion: "Adherence",
    subCriterion: "Biblical_Basis",
    label: "Biblical Basis",
    group: "Adherence",
  },
  {
    key: "adherenceConsistency",
    meanColumn: "adherence_consistency_mean",
    stdevColumn: "adherence_consistency_stdev",
    criterion: "Adherence",
    subCriterion: "Consistency",
    label: "Consistency",
    group: "Adherence",
  },
  {
    key: "adherenceOverall",
    meanColumn: "adherence_overall_mean",
    stdevColumn: "adherence_overall_stdev",
    criterion: "Adherence",
    subCriterion: "Overall",
    label: "Adherence Overall",
    group: "Composite",
  },
  {
    key: "kindnessCoreClarityWithKindness",
    meanColumn: "kindness_and_gentleness_core_clarity_with_kindness_mean",
    stdevColumn: "kindness_and_gentleness_core_clarity_with_kindness_stdev",
    criterion: "Kindness_and_Gentleness",
    subCriterion: "Core_Clarity_with_Kindness",
    label: "Clarity with Kindness",
    group: "Kindness",
  },
  {
    key: "kindnessPastoralSensitivity",
    meanColumn: "kindness_and_gentleness_pastoral_sensitivity_mean",
    stdevColumn: "kindness_and_gentleness_pastoral_sensitivity_stdev",
    criterion: "Kindness_and_Gentleness",
    subCriterion: "Pastoral_Sensitivity",
    label: "Pastoral Sensitivity",
    group: "Kindness",
  },
  {
    key: "kindnessSecondaryFairness",
    meanColumn: "kindness_and_gentleness_secondary_fairness_mean",
    stdevColumn: "kindness_and_gentleness_secondary_fairness_stdev",
    criterion: "Kindness_and_Gentleness",
    subCriterion: "Secondary_Fairness",
    label: "Secondary Fairness",
    group: "Kindness",
  },
  {
    key: "kindnessTertiaryNeutrality",
    meanColumn: "kindness_and_gentleness_tertiary_neutrality_mean",
    stdevColumn: "kindness_and_gentleness_tertiary_neutrality_stdev",
    criterion: "Kindness_and_Gentleness",
    subCriterion: "Tertiary_Neutrality",
    label: "Tertiary Neutrality",
    group: "Kindness",
  },
  {
    key: "kindnessTone",
    meanColumn: "kindness_and_gentleness_tone_mean",
    stdevColumn: "kindness_and_gentleness_tone_stdev",
    criterion: "Kindness_and_Gentleness",
    subCriterion: "Tone",
    label: "Tone",
    group: "Kindness",
  },
  {
    key: "kindnessOverall",
    meanColumn: "kindness_and_gentleness_overall_mean",
    stdevColumn: "kindness_and_gentleness_overall_stdev",
    criterion: "Kindness_and_Gentleness",
    subCriterion: "Overall",
    label: "Kindness Overall",
    group: "Composite",
  },
  {
    key: "interfaithRespectAndHandlingObjections",
    meanColumn: "interfaith_sensitivity_respect_and_handling_objections_mean",
    stdevColumn: "interfaith_sensitivity_respect_and_handling_objections_stdev",
    criterion: "Interfaith_Sensitivity",
    subCriterion: "Respect_and_Handling_Objections",
    label: "Respect & Objections",
    group: "Interfaith",
  },
  {
    key: "interfaithObjectionAcknowledgement",
    meanColumn: "interfaith_sensitivity_objection_acknowledgement_mean",
    stdevColumn: "interfaith_sensitivity_objection_acknowledgement_stdev",
    criterion: "Interfaith_Sensitivity",
    subCriterion: "Objection_Acknowledgement",
    label: "Objection Acknowledgement",
    group: "Interfaith",
  },
  {
    key: "interfaithEvangelism",
    meanColumn: "interfaith_sensitivity_evangelism_mean",
    stdevColumn: "interfaith_sensitivity_evangelism_stdev",
    criterion: "Interfaith_Sensitivity",
    subCriterion: "Evangelism",
    label: "Evangelism",
    group: "Interfaith",
  },
  {
    key: "interfaithGospelBoldness",
    meanColumn: "interfaith_sensitivity_gospel_boldness_mean",
    stdevColumn: "interfaith_sensitivity_gospel_boldness_stdev",
    criterion: "Interfaith_Sensitivity",
    subCriterion: "Gospel_Boldness",
    label: "Gospel Boldness",
    group: "Interfaith",
  },
  {
    key: "interfaithOverall",
    meanColumn: "interfaith_sensitivity_overall_mean",
    stdevColumn: "interfaith_sensitivity_overall_stdev",
    criterion: "Interfaith_Sensitivity",
    subCriterion: "Overall",
    label: "Interfaith Overall",
    group: "Composite",
  },
  {
    key: "finalOverall",
    meanColumn: "final_overall_mean",
    stdevColumn: "final_overall_stdev",
    criterion: "Overall",
    subCriterion: "Final_Overall",
    label: "Final Overall",
    group: "Composite",
  },
  {
    key: "weightedProductionScore",
    meanColumn: "weighted_production_score_mean",
    stdevColumn: "weighted_production_score_stdev",
    criterion: "Overall",
    subCriterion: "Weighted_Production_Score",
    label: "Weighted Production",
    group: "Composite",
  },
] as const;

export type MetricDefinition = (typeof METRIC_DEFINITIONS)[number];
export type MetricKey = MetricDefinition["key"];
export type MetricGroup = MetricDefinition["group"];

export interface ScoreSummary {
  mean: number;
  stdev: number;
}

export interface EvaluationRun {
  runId: string;
  answersLabel: string;
  provider: string;
  genModel: string;
  systemPromptLabel: string;
  judgeModel: string;
  evalVersion: string;
  evaluatedAt: string;
  timestampSource: string;
  questionCount: number;
  errorCount: number;
  sourceDataset: string;
  sourceResults: string;
  scores: Record<MetricKey, ScoreSummary>;
}

export function getMetricDefinition(key: MetricKey): MetricDefinition {
  const definition = METRIC_DEFINITIONS.find((metric) => metric.key === key);
  if (!definition) {
    throw new Error(`Unknown evaluation metric: ${key}`);
  }
  return definition;
}
