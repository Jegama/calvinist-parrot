// app/api/user-memory/route.ts
// Helper API to view and manage user memories
// For testing and debugging memory extraction

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getUserProfile,
  searchUserMemories,
  getMemoryStore,
} from "@/lib/langGraphStore";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const action = searchParams.get("action") || "get"; // 'get' or 'search'
  const query = searchParams.get("query");

  if (!userId) {
    return NextResponse.json(
      {
        error: "userId query parameter is required",
        example: "/api/user-memory?userId=YOUR_USER_ID",
      },
      { status: 400 }
    );
  }

  // 🔒 Security: Verify the requesting user matches the userId
  const cookieStore = await cookies();
  const requestingUserId = cookieStore.get("userId")?.value;

  if (!requestingUserId) {
    return NextResponse.json(
      {
        error: "Unauthorized - Please log in",
      },
      { status: 401 }
    );
  }

  if (requestingUserId !== userId) {
    return NextResponse.json(
      {
        error: "Forbidden - You can only access your own memories",
      },
      { status: 403 }
    );
  }

  try {
    if (action === "search" && query) {
      // Search memories by query
      const results = await searchUserMemories(userId, query, 10);
      return NextResponse.json({
        userId,
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
      const profile = await getUserProfile(userId);

      if (!profile) {
        return NextResponse.json({
          userId,
          profile: null,
          message: "No profile found for this user. Have a conversation first!",
        });
      }

      // Format response for readability
      return NextResponse.json({
        userId,
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
        userId,
      },
      { status: 500 }
    );
  }
}

// DELETE endpoint to clear a user's memories (useful for testing)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      {
        error: "userId query parameter is required",
      },
      { status: 400 }
    );
  }

  // 🔒 Security: Verify the requesting user matches the userId
  const cookieStore = await cookies();
  const requestingUserId = cookieStore.get("userId")?.value;

  if (!requestingUserId) {
    return NextResponse.json(
      {
        error: "Unauthorized - Please log in",
      },
      { status: 401 }
    );
  }

  if (requestingUserId !== userId) {
    return NextResponse.json(
      {
        error: "Forbidden - You can only delete your own memories",
      },
      { status: 403 }
    );
  }

  try {
    const store = getMemoryStore();
    const namespace = ["memories", userId];

    // Get all memories for this user
    const memories = await store.search(namespace, { limit: 100 });

    // Delete each memory
    for (const memory of memories) {
      await store.delete(namespace, memory.key);
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${memories.length} memories for user ${userId}`,
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
