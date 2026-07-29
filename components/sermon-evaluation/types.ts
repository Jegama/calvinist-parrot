export const SERMON_STATUSES = [
  "QUEUED",
  "PREPARING_AUDIO",
  "EXTRACTING",
  "SCORING",
  "HARMONIZING",
  "CALIBRATING",
  "SUMMARIZING",
  "COMPLETE",
  "COMPLETE_WITH_WARNINGS",
  "FAILED",
  "TIMED_OUT",
  "CANCELED",
] as const;

export type SermonStatus = (typeof SERMON_STATUSES)[number];
export type SermonPreset = "STANDARD" | "HIGH_CONFIDENCE" | "CUSTOM";
export type SermonExportFormat = "markdown" | "pdf" | "json" | "csv";

export type SermonCapabilities = {
  hasAccess: boolean;
  isAdmin: boolean;
  canChooseCustomRunCount: boolean;
  dailyQuotaExempt: boolean;
  allowedRunCountMin: number;
  allowedRunCountMax: number;
};

export type RunCredits = {
  limit: number;
  consumed: number;
  reserved: number;
  remaining: number;
};

export type SermonEvaluationListItem = {
  id: string;
  title: string;
  preacher: string;
  preachedOn: string;
  createdAt: string;
  updatedAt: string;
  status: SermonStatus;
  preset: SermonPreset;
  requestedRuns: number;
  completedRuns: number;
  overallImpactBase: number | null;
  overallImpactAdjusted: number | null;
  durationAdjustmentEnabled: boolean;
  durationSeconds: number | null;
  uncertaintyLow: number | null;
  uncertaintyHigh: number | null;
  hasRetainedAudio: boolean;
  runCredits: RunCredits;
};

export type SermonAnalyticsPoint = SermonEvaluationListItem & {
  aggregateScores: Record<string, number>;
};

export type SermonAnalytics = {
  evaluations: SermonAnalyticsPoint[];
};

export type SermonStructurePoint = {
  heading: string;
  summary?: string | null;
  scriptures?: string[];
  subpoints?: string[];
  applications?: string[];
  illustrations?: string[];
  comments?: string | null;
  feedback?: string | null;
};

export type SermonSubcriterion = {
  key: string;
  label: string;
  score: number | null;
  feedback?: string | null;
};

export type SermonRubricSection = {
  key: string;
  label: string;
  score: number | null;
  feedback?: string | null;
  subcriteria: SermonSubcriterion[];
};

export type SermonHistoryItem = {
  id: string;
  status: SermonStatus;
  preset: SermonPreset;
  requestedRuns: number;
  completedRuns: number;
  overallImpactBase: number | null;
  overallImpactAdjusted: number | null;
  durationAdjustmentEnabled: boolean;
  createdAt: string;
};

export type SermonEvaluationDetail = SermonEvaluationListItem & {
  audio: {
    filename: string | null;
    mimeType: string | null;
    byteSize: number | null;
    verified: boolean;
  };
  calculatedDurationPenalty: number | null;
  aggregateScores: Record<string, number>;
  aggregateFeedback: Record<string, string>;
  rubricSections: SermonRubricSection[];
  scoringConfidence: number | null;
  structure: {
    scriptureIntroduction?: string | null;
    sermonIntroduction?: string | null;
    proposition?: string | null;
    fallenConditionFocus?: string | null;
    fallenConditionComments?: string | null;
    conclusion?: string | null;
    extractionConfidence?: number | null;
    points: SermonStructurePoint[];
    applications: string[];
    illustrations: string[];
    comments?: string | null;
    generalComments: {
      content?: string | null;
      structure?: string | null;
      explanation?: string | null;
    };
  };
  coaching: {
    summary?: string | null;
    strengths: string[];
    growthAreas: string[];
    nextSteps: string[];
  };
  warnings: Array<{ code?: string; message: string }>;
  errorCode?: string | null;
  errorMessage?: string | null;
  canonicalEvaluationId?: string | null;
  canonicalDetailUrl?: string | null;
  cancelRequestedAt?: string | null;
  retryWave?: number | null;
  attemptNumber?: number | null;
  stageStartedAt?: string | null;
  history: SermonHistoryItem[];
  provenance: Record<string, string | number | boolean | null>;
  reports: Array<{
    format: SermonExportFormat;
    version: string;
    createdAt?: string | null;
  }>;
  durationPolicyUpdatedAt?: string | null;
  reportRegenerationPending: boolean;
};

export type UploadAuthorization = {
  reservationId: string;
  mode: "appwrite" | "local";
  uploadUrl?: string;
  jwt: string;
  bucketId: string;
  fileId: string;
  endpoint?: string;
  projectId?: string;
  expiresAt?: string;
  permissions?: string[];
};

export type PrepareUploadDecision =
  | {
      decision: "existing_evaluation";
      evaluationId: string;
      detailUrl: string;
      runCreditsRemaining: number;
    }
  | {
      decision: "reattach_required";
      evaluationId: string;
      detailUrl: string;
      runCreditsRemaining: number;
      upload?: UploadAuthorization;
    }
  | {
      decision: "upload_required";
      upload: UploadAuthorization;
    };

export type FinalizeUploadDecision =
  | {
      decision: "audio_ready";
      reservationId: string;
      audioAssetId: string;
      expiresAt?: string;
    }
  | {
      decision: "existing_evaluation";
      evaluationId: string;
      detailUrl: string;
    };

export type UploadProgressState =
  | { phase: "idle"; progress: number; message: string }
  | { phase: "hashing"; progress: number; message: string }
  | { phase: "checking"; progress: number; message: string }
  | { phase: "uploading"; progress: number; message: string }
  | { phase: "finalizing"; progress: number; message: string }
  | { phase: "queueing"; progress: number; message: string }
  | { phase: "redirecting"; progress: number; message: string };

export type SermonPlaybackAuthorization = {
  url: string;
  expiresAt: string;
};

export const ACTIVE_SERMON_STATUSES = new Set<SermonStatus>([
  "QUEUED",
  "PREPARING_AUDIO",
  "EXTRACTING",
  "SCORING",
  "HARMONIZING",
  "CALIBRATING",
  "SUMMARIZING",
]);

export const TERMINAL_SERMON_STATUSES = new Set<SermonStatus>([
  "COMPLETE",
  "COMPLETE_WITH_WARNINGS",
  "FAILED",
  "TIMED_OUT",
  "CANCELED",
]);

export const COMPLETE_SERMON_STATUSES = new Set<SermonStatus>(["COMPLETE", "COMPLETE_WITH_WARNINGS"]);

export function isSermonStatus(value: unknown): value is SermonStatus {
  return typeof value === "string" && (SERMON_STATUSES as readonly string[]).includes(value);
}
