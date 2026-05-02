// app/profile/api.ts

import type { ProfileOverviewResponse } from "./types";

/**
 * Fetch complete profile overview including questions, stats, space, and membership
 */
export async function fetchProfileOverview(): Promise<ProfileOverviewResponse> {
  const response = await fetch(`/api/profile/overview`);
  if (!response.ok) {
    throw new Error("Failed to load profile overview");
  }
  return (await response.json()) as ProfileOverviewResponse;
}

/**
 * Update user's denomination preference
 */
export async function updateDenomination(denomination: string): Promise<void> {
  const response = await fetch(`/api/user-profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ denomination }),
  });

  if (!response.ok) {
    throw new Error("Failed to update denomination");
  }
}

/**
 * Create a new family prayer space
 */
export async function createPrayerSpace(spaceName: string): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceName }),
  });

  if (!response.ok) {
    throw new Error("Failed to create prayer space");
  }
}

/**
 * Join an existing prayer space using a share code
 */
export async function joinPrayerSpace(joinCode: string): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shareCode: joinCode }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(errorData.error || "Failed to join space");
  }
}

/**
 * Rename an existing prayer space
 */
export async function renamePrayerSpace(spaceId: string, spaceName: string): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/spaces`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceId, spaceName }),
  });

  if (!response.ok) {
    throw new Error("Failed to rename prayer space");
  }
}

/**
 * Remove a member from a prayer space
 */
export async function removeMemberFromSpace(spaceId: string, removeMemberId: string): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/spaces`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceId, removeMemberId }),
  });

  if (!response.ok) {
    throw new Error("Failed to remove member");
  }
}

/**
 * Leave a prayer space (with optional ownership transfer for owners)
 */
export async function leavePrayerSpace(spaceId: string, transferToMemberId?: string): Promise<void> {
  const payload: Record<string, string> = { spaceId };
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
export async function regenerateShareCode(): Promise<{ shareCode: string }> {
  const response = await fetch(`/api/prayer-tracker/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regenerate: true }),
  });

  if (!response.ok) {
    throw new Error("Failed to regenerate share code");
  }

  return (await response.json()) as { shareCode: string };
}

/**
 * Add a non-account (child) member to the space
 */
export async function addChildMember(
  displayName: string,
  assignmentCapacity?: number,
  birthdate?: string
): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName, assignmentCapacity, isChild: true, birthdate }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to add member" }));
    throw new Error(errorData.error || "Failed to add member");
  }
}

/**
 * Update an existing member's capacity or name (owner only)
 */
export async function updateMember(
  memberId: string,
  payload: { displayName?: string; assignmentCapacity?: number; isChild?: boolean; birthdate?: string | null }
): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId, ...payload }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to update member" }));
    throw new Error(errorData.error || "Failed to update member");
  }
}

/**
 * Permanently delete entire household and all related data.
 * Only available when the user is the sole adult with an account.
 */
export async function deleteHousehold(spaceId: string): Promise<void> {
  const response = await fetch(`/api/prayer-tracker/spaces/delete-household`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to delete household" }));
    throw new Error(errorData.error || "Failed to delete household");
  }
}
