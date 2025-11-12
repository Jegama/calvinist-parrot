// app/profile/api.ts

import type { ProfileOverviewResponse } from "./types";

/**
 * Fetch complete profile overview including questions, stats, space, and membership
 */
export async function fetchProfileOverview(
  userId: string
): Promise<ProfileOverviewResponse> {
  const response = await fetch(
    `/api/profile/overview?userId=${encodeURIComponent(userId)}`
  );
  if (!response.ok) {
    throw new Error("Failed to load profile overview");
  }
  return (await response.json()) as ProfileOverviewResponse;
}

/**
 * Update user's denomination preference
 */
export async function updateDenomination(
  userId: string,
  denomination: string
): Promise<void> {
  const response = await fetch(`/api/user-profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, denomination }),
  });

  if (!response.ok) {
    throw new Error("Failed to update denomination");
  }
}

/**
 * Create a new family prayer space
 */
export async function createPrayerSpace(
  userId: string,
  spaceName: string
): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, spaceName }),
  });

  if (!response.ok) {
    throw new Error("Failed to create prayer space");
  }
}

/**
 * Join an existing prayer space using a share code
 */
export async function joinPrayerSpace(
  userId: string,
  joinCode: string
): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/spaces`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, joinCode }),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(errorData.error || "Failed to join space");
  }
}

/**
 * Rename an existing prayer space
 */
export async function renamePrayerSpace(
  userId: string,
  spaceId: string,
  spaceName: string
): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/spaces`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, spaceId, spaceName }),
  });

  if (!response.ok) {
    throw new Error("Failed to rename prayer space");
  }
}

/**
 * Remove a member from a prayer space
 */
export async function removeMemberFromSpace(
  userId: string,
  spaceId: string,
  removeMemberId: string
): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/spaces`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, spaceId, removeMemberId }),
  });

  if (!response.ok) {
    throw new Error("Failed to remove member");
  }
}

/**
 * Leave a prayer space (with optional ownership transfer for owners)
 */
export async function leavePrayerSpace(
  userId: string,
  spaceId: string,
  transferToMemberId?: string
): Promise<void> {
  const payload: Record<string, string> = { userId, spaceId };
  if (transferToMemberId) {
    payload.transferToMemberId = transferToMemberId;
  }

  const response = await fetch(`/api/prayer-tracker/spaces`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to leave prayer space");
  }
}

/**
 * Regenerate share code for a prayer space
 */
export async function regenerateShareCode(
  userId: string,
  spaceId: string
): Promise<{ shareCode: string }> {
  const response = await fetch(`/api/prayer-tracker/spaces/regenerate-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, spaceId }),
  });

  if (!response.ok) {
    throw new Error("Failed to regenerate share code");
  }

  return (await response.json()) as { shareCode: string };
}
