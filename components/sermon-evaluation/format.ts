import type { SermonPreset, SermonStatus } from "./types";

export function formatSermonStatus(status: SermonStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatSermonPreset(preset: SermonPreset): string {
  if (preset === "HIGH_CONFIDENCE") {
    return "High confidence";
  }
  if (preset === "CUSTOM") {
    return "Admin custom";
  }
  return "Standard";
}

export function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

export function formatDate(value: string): string {
  if (!value) {
    return "Date unavailable";
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(date);
}

export function formatDateTime(value: string): string {
  if (!value) {
    return "Time unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) {
    return "—";
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatMetricLabel(key: string): string {
  return key
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
