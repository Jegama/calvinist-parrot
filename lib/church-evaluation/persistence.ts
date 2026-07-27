import type {
  CoreDoctrineStatusValue,
  EvaluationStatus,
} from "@/types/church";

export function toCoreDoctrineStatusEnum(
  value: CoreDoctrineStatusValue,
): "TRUE" | "FALSE" | "UNKNOWN" {
  if (value === "true") return "TRUE";
  if (value === "false") return "FALSE";
  return "UNKNOWN";
}

export function toEvaluationStatusEnum(
  value: EvaluationStatus,
):
  | "RECOMMENDED"
  | "BIBLICALLY_SOUND_WITH_DIFFERENCES"
  | "LIMITED_INFORMATION"
  | "NOT_ENDORSED" {
  if (value === "recommended") return "RECOMMENDED";
  if (value === "biblically_sound_with_differences") {
    return "BIBLICALLY_SOUND_WITH_DIFFERENCES";
  }
  if (value === "limited_information") return "LIMITED_INFORMATION";
  return "NOT_ENDORSED";
}
