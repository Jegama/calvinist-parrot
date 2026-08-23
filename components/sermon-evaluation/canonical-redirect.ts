import type { SermonEvaluationDetail } from "./types";

const SAFE_EVALUATION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

type CanonicalEvaluationPointer = Pick<
  SermonEvaluationDetail,
  "canonicalEvaluationId" | "canonicalDetailUrl"
>;

export function canonicalDuplicateRedirectUrl(
  currentEvaluationId: string,
  pointer: CanonicalEvaluationPointer | null | undefined,
): string | null {
  const canonicalEvaluationId = pointer?.canonicalEvaluationId?.trim();
  if (
    !canonicalEvaluationId ||
    canonicalEvaluationId === currentEvaluationId ||
    !SAFE_EVALUATION_ID.test(canonicalEvaluationId)
  ) {
    return null;
  }

  const expectedDetailUrl = `/sermon-evaluation/${canonicalEvaluationId}`;
  const providedDetailUrl = pointer?.canonicalDetailUrl?.trim();
  if (
    pointer?.canonicalDetailUrl != null &&
    providedDetailUrl !== expectedDetailUrl
  ) {
    return null;
  }

  return `${expectedDetailUrl}?notice=duplicate`;
}
