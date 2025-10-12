import { Family, Member } from "./types";

export const defaultCategories = [
  "Church Friends",
  "Neighbors",
  "Extended Family",
  "Missionaries",
  "Coworkers",
];

export function formatRelative(dateString?: string | null) {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatTimeSince(dateString?: string | null) {
  if (!dateString) return "Not yet";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not yet";
  const diff = Date.now() - date.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const days = Math.floor(diff / dayMs);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function determineNextMemberId(family: Family, members: Member[]): string | undefined {
  if (!members.length) return undefined;
  if (members.length === 1) return members[0].id;
  const lastId = family.lastPrayedByMemberId;
  if (!lastId) return members[0].id;
  const next = members.find((member) => member.id !== lastId);
  return next?.id ?? members[0].id;
}

export function normalizeChildren(input: string) {
  return input
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function appendUserId(path: string, userId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}userId=${encodeURIComponent(userId)}`;
}

export async function readErrorMessage(response: Response) {
  try {
    const data = await response.json();
    if (data && typeof data.error === "string" && data.error.trim().length) {
      return data.error.trim();
    }
  } catch {
    // ignore json parse issues
  }
  if (response.status >= 500) return "Unexpected server error. Please try again.";
  return "Unable to process this request right now.";
}
