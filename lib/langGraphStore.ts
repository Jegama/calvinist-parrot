// lib/langGraphStore.ts
// Long-term memory store for cross-thread user memories

import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";

const DB_URI = process.env.DATABASE_URL;

if (!DB_URI) {
  throw new Error(
    "DATABASE_URL environment variable is required for memory store"
  );
}

// Singleton instance of the memory store
let storeInstance: PostgresStore | null = null;

/**
 * Get the shared PostgresStore instance for long-term memory
 * Uses the same PostgreSQL database as Prisma
 */
export function getMemoryStore(): PostgresStore {
  if (!storeInstance) {
    storeInstance = PostgresStore.fromConnString(DB_URI!);
  }
  return storeInstance;
}

/**
 * Initialize the memory store tables in the database
 * Call this once during application startup or via a setup script
 *
 * This creates the necessary tables in PostgreSQL to store:
 * - Cross-thread memories organized by namespace
 * - Semantic search indices (if configured)
 *
 * Safe to call multiple times - will only create tables if they don't exist
 */
export async function setupMemoryStore(): Promise<void> {
  const store = getMemoryStore();
  await store.setup();
  console.log("✅ LangGraph memory store initialized");
}

/**
 * Memory namespace helper functions
 * Namespaces organize memories like folders: ["memories", userId, memoryType]
 */
export const MemoryNamespaces = {
  /**
   * User profile: Single document containing all user information
   * Key: "profile"
   */
  userProfile: (userId: string) => ["memories", userId, "profile"],

  /**
   * Theological interests: Topics the user has discussed
   * Key: "theological-interests"
   */
  theologicalInterests: (userId: string) => ["memories", userId, "theological"],

  /**
   * Personal context: Life situation, concerns, spiritual journey
   * Key: "personal-context"
   */
  personalContext: (userId: string) => ["memories", userId, "personal"],
};

/**
 * Memory key constants
 * Use consistent keys to update (not duplicate) memories
 */
export const MemoryKeys = {
  USER_PROFILE: "profile",
  THEOLOGICAL_INTERESTS: "theological-interests",
  PERSONAL_CONTEXT: "personal-context",
} as const;

/**
 * Type definitions for memory documents
 */
export interface UserProfileMemory extends Record<string, unknown> {
  userId: string;
  theologicalInterests: {
    [topic: string]: {
      count: number;
      lastMentioned: string;
      contexts: string[];
    };
  };
  personalContext: {
    lifeStage?: string;
    concerns?: string[];
    spiritualJourney?: string[];
  };
  preferences?: {
    preferredTopics?: string[];
  };
  lastUpdated: string;
}

/**
 * Example helper to store/update user profile memory
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfileMemory>
): Promise<void> {
  const store = getMemoryStore();
  const namespace = MemoryNamespaces.userProfile(userId);

  // Get existing profile or create default
  const existing = await store.get(namespace, MemoryKeys.USER_PROFILE);
  const currentProfile: UserProfileMemory =
    (existing?.value as UserProfileMemory) || {
      userId,
      theologicalInterests: {},
      personalContext: {},
      lastUpdated: new Date().toISOString(),
    };

  // Merge updates
  const updatedProfile: UserProfileMemory = {
    ...currentProfile,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };

  // Store with same key to update (not duplicate)
  await store.put(namespace, MemoryKeys.USER_PROFILE, updatedProfile);
}

/**
 * Example helper to retrieve user profile memory
 */
export async function getUserProfile(
  userId: string
): Promise<UserProfileMemory | null> {
  const store = getMemoryStore();
  const namespace = MemoryNamespaces.userProfile(userId);

  const result = await store.get(namespace, MemoryKeys.USER_PROFILE);
  return (result?.value as UserProfileMemory) || null;
}

/**
 * Example helper to search memories across all types
 */
export async function searchUserMemories(
  userId: string,
  query: string,
  limit: number = 5
) {
  const store = getMemoryStore();
  const namespace = ["memories", userId]; // Search all memory types

  return await store.search(namespace, { query, limit });
}
