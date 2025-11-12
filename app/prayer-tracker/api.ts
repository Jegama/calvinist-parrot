import { appendUserId, handleApiError } from "./utils";
import type { Family, Member, PersonalRequest, UnifiedRequest } from "./types";

/**
 * Result type for API operations - either success with data or failure with error message
 */
export type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Space data returned from the API
 */
export type SpaceData = {
  spaceName: string;
  members: Member[];
};

/**
 * Rotation data returned from the API
 */
export type RotationData = {
  families: Family[];
  personal: PersonalRequest[];
  members?: Member[];
};

/**
 * Payload for confirming rotation
 */
export type ConfirmRotationPayload = {
  userId: string;
  familyAssignments: Array<{ familyId: string; prayedByMemberId: string }>;
  personalIds: string[];
};

// ============================================================================
// SPACE API
// ============================================================================

/**
 * Fetches the user's prayer space including space name and members
 */
export async function fetchSpace(userId: string): Promise<Result<SpaceData | null>> {
  try {
    const res = await fetch(appendUserId(`/api/prayer-tracker/spaces`, userId));
    
    if (!res.ok) {
      return { success: true, data: null }; // No space exists yet
    }

    const data = await res.json();
    const space: SpaceData = {
      spaceName: data?.space?.spaceName ?? null,
      members: Array.isArray(data?.space?.members) ? data.space.members : [],
    };

    return { success: true, data: space };
  } catch (error) {
    console.error("Failed to load space", error);
    return { success: false, error: "Unable to load your prayer space right now." };
  }
}

// ============================================================================
// FAMILY API
// ============================================================================

/**
 * Fetches all families for the user
 */
export async function fetchFamilies(userId: string): Promise<Result<Family[]>> {
  try {
    const res = await fetch(appendUserId(`/api/prayer-tracker/families`, userId));
    
    if (!res.ok) {
      const message = await handleApiError(res, "Unable to load families right now.");
      return { success: false, error: message };
    }

    const data = await res.json();
    const families = Array.isArray(data) ? data : [];
    return { success: true, data: families };
  } catch (error) {
    console.error("Failed to fetch families", error);
    return { success: false, error: "Unable to load families right now." };
  }
}

/**
 * Creates a new family
 */
export async function createFamily(
  userId: string,
  payload: {
    familyName: string;
    parents: string;
    children: string[];
    categoryTag?: string;
  }
): Promise<Result<Family>> {
  try {
    const response = await fetch(`/api/prayer-tracker/families`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...payload }),
    });

    if (!response.ok) {
      const message = await handleApiError(response, "Unable to save family right now.");
      return { success: false, error: message };
    }

    const family = await response.json();
    return { success: true, data: family };
  } catch (error) {
    console.error("Failed to create family", error);
    return { success: false, error: "Unable to save family right now." };
  }
}

/**
 * Updates an existing family
 */
export async function updateFamily(
  userId: string,
  familyId: string,
  payload: {
    familyName?: string;
    parents?: string;
    children?: string[];
    categoryTag?: string | null;
    lastPrayedAt?: string | null;
    archive?: boolean;
    unarchive?: boolean;
  }
): Promise<Result<Family>> {
  try {
    const response = await fetch(
      appendUserId(`/api/prayer-tracker/families/${familyId}`, userId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...payload }),
      }
    );

    if (!response.ok) {
      const message = await handleApiError(response, "Unable to update this family right now.");
      return { success: false, error: message };
    }

    const family = await response.json();
    return { success: true, data: family };
  } catch (error) {
    console.error("Failed to update family", error);
    return { success: false, error: "Unable to update this family right now." };
  }
}

/**
 * Deletes a family
 */
export async function deleteFamily(
  userId: string,
  familyId: string
): Promise<Result<void>> {
  try {
    const response = await fetch(
      appendUserId(`/api/prayer-tracker/families/${familyId}`, userId),
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }
    );

    if (!response.ok) {
      const message = await handleApiError(response, "Unable to delete this family right now.");
      return { success: false, error: message };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to delete family", error);
    return { success: false, error: "Unable to delete this family right now." };
  }
}

// ============================================================================
// UNIFIED REQUESTS API (NEW)
// ============================================================================

/**
 * Fetches all requests (both household and family-specific) in unified format
 */
export async function fetchUnifiedRequests(userId: string): Promise<Result<UnifiedRequest[]>> {
  try {
    const res = await fetch(appendUserId(`/api/prayer-tracker/requests`, userId));
    
    if (!res.ok) {
      const message = await handleApiError(res, "Unable to load requests right now.");
      return { success: false, error: message };
    }

    const data = await res.json();
    const requests = Array.isArray(data) ? data : [];
    return { success: true, data: requests };
  } catch (error) {
    console.error("Failed to fetch unified requests", error);
    return { success: false, error: "Unable to load requests right now." };
  }
}

/**
 * Creates a new request (either household or family-specific)
 */
export async function createUnifiedRequest(
  userId: string,
  payload: {
    requestText: string;
    notes?: string;
    linkedToFamily: string; // "household" or familyId
  }
): Promise<Result<UnifiedRequest>> {
  try {
    const response = await fetch(`/api/prayer-tracker/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...payload }),
    });

    if (!response.ok) {
      const message = await handleApiError(response, "Unable to save request right now.");
      return { success: false, error: message };
    }

    const request = await response.json();
    return { success: true, data: request };
  } catch (error) {
    console.error("Failed to create unified request", error);
    return { success: false, error: "Unable to save request right now." };
  }
}

/**
 * Updates an existing request (handles both types)
 * Supports moving requests between tables when linkedToFamily changes
 */
export async function updateUnifiedRequest(
  userId: string,
  requestId: string,
  payload: {
    requestText?: string;
    notes?: string | null;
    lastPrayedAt?: string | null;
    markAnswered?: boolean;
    isHouseholdRequest: boolean;
    linkedToFamily?: string;
    originalLinkedToFamily?: string;
  }
): Promise<Result<UnifiedRequest>> {
  try {
    const response = await fetch(
      appendUserId(`/api/prayer-tracker/requests/${requestId}`, userId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...payload }),
      }
    );

    if (!response.ok) {
      const message = await handleApiError(response, "Unable to update this request right now.");
      return { success: false, error: message };
    }

    const request = await response.json();
    return { success: true, data: request };
  } catch (error) {
    console.error("Failed to update unified request", error);
    return { success: false, error: "Unable to update this request right now." };
  }
}

/**
 * Deletes a request (handles both types)
 */
export async function deleteUnifiedRequest(
  userId: string,
  requestId: string,
  isHouseholdRequest: boolean
): Promise<Result<void>> {
  try {
    const response = await fetch(
      appendUserId(`/api/prayer-tracker/requests/${requestId}`, userId),
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isHouseholdRequest }),
      }
    );

    if (!response.ok) {
      const message = await handleApiError(response, "Unable to delete this request right now.");
      return { success: false, error: message };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to delete unified request", error);
    return { success: false, error: "Unable to delete this request right now." };
  }
}

/**
 * Fetches family-specific requests for a single family
 */
export async function fetchFamilyRequests(
  userId: string,
  familyId: string
): Promise<Result<UnifiedRequest[]>> {
  try {
    const res = await fetch(
      appendUserId(`/api/prayer-tracker/families/${familyId}/requests`, userId)
    );
    
    if (!res.ok) {
      const message = await handleApiError(res, "Unable to load family requests right now.");
      return { success: false, error: message };
    }

    const data = await res.json();
    const requests = Array.isArray(data) 
      ? data.map((req: UnifiedRequest) => ({ ...req, familyId, familyName: null }))
      : [];
    return { success: true, data: requests };
  } catch (error) {
    console.error("Failed to fetch family requests", error);
    return { success: false, error: "Unable to load family requests right now." };
  }
}

// ============================================================================
// ROTATION API
// ============================================================================

/**
 * Computes tonight's rotation
 */
export async function computeRotation(userId: string): Promise<Result<RotationData>> {
  try {
    const res = await fetch(appendUserId(`/api/prayer-tracker/rotation`, userId));
    
    if (!res.ok) {
      const message = await handleApiError(res, "Unable to compute rotation right now.");
      return { success: false, error: message };
    }

    const data = await res.json();
    const rotation: RotationData = {
      families: Array.isArray(data?.families) ? data.families : [],
      personal: Array.isArray(data?.personal) ? data.personal : [],
      members: Array.isArray(data?.members) ? data.members : undefined,
    };

    return { success: true, data: rotation };
  } catch (error) {
    console.error("Failed to compute rotation", error);
    return { success: false, error: "Unable to compute tonight's rotation right now." };
  }
}

/**
 * Confirms the rotation and marks items as prayed
 */
export async function confirmRotation(
  userId: string,
  payload: ConfirmRotationPayload
): Promise<Result<void>> {
  try {
    const res = await fetch(appendUserId(`/api/prayer-tracker/rotation/confirm`, userId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const message = await handleApiError(res, "Unable to save updates right now.");
      return { success: false, error: message };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to confirm rotation", error);
    return { success: false, error: "Unable to save updates right now. Please try again." };
  }
}
