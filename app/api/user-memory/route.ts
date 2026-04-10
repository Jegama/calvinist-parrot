// app/api/user-memory/route.ts
// Helper API to view and manage user memories
// For testing and debugging memory extraction

import { NextResponse } from "next/server";
import {
  getUserProfile,
  searchUserMemories,
  getMemoryStore,
} from "@/lib/langGraphStore";
import { requireAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "get"; // 'get' or 'search'
  const query = searchParams.get("query");

  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized - Please log in" }, { status: 401 });

  try {
    if (action === "search" && query) {
      // Search memories by query
      const results = await searchUserMemories(authenticatedUserId, query, 10);
      return NextResponse.json({
        userId: authenticatedUserId,
        query,
        results: results.map((r) => ({
          key: r.key,
          namespace: r.namespace,
          value: r.value,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      });
    } else {
      // Get full user profile
      const profile = await getUserProfile(authenticatedUserId);

      if (!profile) {
        return NextResponse.json({
          userId: authenticatedUserId,
          profile: null,
          message: "No profile found for this user. Have a conversation first!",
        });
      }

      // Format response for readability
      return NextResponse.json({
        userId: authenticatedUserId,
        profile,
        summary: {
          totalTheologicalTopics: Object.keys(
            profile.theologicalInterests || {}
          ).length,
          hasPersonalContext:
            !!profile.personalContext &&
            Object.keys(profile.personalContext).length > 0,
          lastUpdated: profile.lastUpdated,
        },
      });
    }
  } catch (error) {
    console.error("Error fetching user memory:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: authenticatedUserId,
      },
      { status: 500 }
    );
  }
}

// DELETE endpoint to clear a user's memories (useful for testing)
export async function DELETE(request: Request) {
  void request;
  const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse || !authenticatedUserId)
    return errorResponse ?? NextResponse.json({ error: "Unauthorized - Please log in" }, { status: 401 });

  try {
    const store = getMemoryStore();
    const namespace = ["memories", authenticatedUserId];

    // Get all memories for this user
    const memories = await store.search(namespace, { limit: 100 });

    // Delete each memory
    for (const memory of memories) {
      await store.delete(namespace, memory.key);
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${memories.length} memories for user ${authenticatedUserId}`,
      deletedCount: memories.length,
    });
  } catch (error) {
    console.error("Error deleting user memories:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
