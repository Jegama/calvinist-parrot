// app/api/journal/focus/route.ts
// GET: Returns aggregated keywords and themes from user's recent journal entries
// Used for "Recent Focus" section in the journal UI

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import type { Call2Output } from "@/types/journal";

interface FocusResponse {
  /** Recurring themes identified by LLM */
  recurringThemes: Array<{ theme: string; count: number; category: string }>;
  /** Number of days this data covers */
  periodDays: number;
  /** Total entries analyzed */
  entriesAnalyzed: number;
}

/**
 * GET /api/journal/focus
 * Returns aggregated keywords and themes from the user's recent journal entries
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const days = parseInt(searchParams.get("days") || "30", 10);

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  // Get user profile
  const profile = await prisma.userProfile.findUnique({
    where: { appwriteUserId: userId },
  });

  if (!profile) {
    return NextResponse.json({
      recurringThemes: [],
      periodDays: days,
      entriesAnalyzed: 0,
    } satisfies FocusResponse);
  }

  // Calculate date range
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch AI outputs from user's PERSONAL journal entries
  const entries = await prisma.journalEntry.findMany({
    where: {
      authorProfileId: profile.id,
      entryType: "PERSONAL",
      entryDate: { gte: startDate },
    },
    include: {
      aiOutput: {
        select: { call2: true },
      },
    },
  });

  // Aggregate keywords and themes
  // Aggregate themes from recent entries
  const themeCounts = new Map<string, number>();

  for (const entry of entries) {
    const call2 = entry.aiOutput?.call2 as Call2Output | null;

    // Count recurring themes
    if (call2?.dashboardSignals?.recurringTheme) {
      const theme = call2.dashboardSignals.recurringTheme;
      themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
    }
  }

  // Get recurring themes sorted by frequency
  const recurringThemes = [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([theme, count]) => ({
      theme,
      count,
      category: detectTagCategory(theme),
    }));

  return NextResponse.json({
    recurringThemes,
    periodDays: days,
    entriesAnalyzed: entries.length,
  } satisfies FocusResponse);
}

/**
 * Detect the category of a theme based on allowed tag values
 */
function detectTagCategory(theme: string): string {
  // Handle prefixed format (e.g., "circumstance:Parenting")
  if (theme.includes(":")) {
    const [prefix] = theme.split(":");
    const knownCategories = ["circumstance", "heartIssue", "rulingDesire", "virtue", "theologicalTheme", "meansOfGrace"];
    if (knownCategories.includes(prefix)) {
      return prefix;
    }
  }

  // Fallback: check if the theme value matches known values
  const categories: Record<string, string[]> = {
    circumstance: ["Work", "Marriage", "Parenting", "Church", "Friendship", "Health", "Finances", "Suffering", "Conflict", "Temptation", "Decision", "Rest", "Time stewardship"],
    heartIssue: ["Anger", "Fear", "Anxiety", "Pride", "People-pleasing", "Control", "Bitterness", "Envy", "Lust", "Sloth", "Self-righteousness", "Unbelief", "Despair", "Shame"],
    rulingDesire: ["Comfort", "Approval", "Power", "Control", "Security", "Success", "Ease", "Reputation"],
    virtue: ["Patience", "Gentleness", "Courage", "Humility", "Contentment", "Gratitude", "Self-control", "Love", "Honesty", "Diligence", "Hope"],
    theologicalTheme: ["Sovereignty", "Providence", "Sanctification", "Justification", "Union with Christ", "Repentance", "Faith", "Adoption", "Perseverance", "Wisdom", "Suffering", "Forgiveness", "Reconciliation"],
    meansOfGrace: ["Scripture", "Prayer", "Lord's Day", "Fellowship", "Accountability", "Confession", "Service"],
  };

  for (const [category, values] of Object.entries(categories)) {
    if (values.includes(theme)) {
      return category;
    }
  }

  return "other";
}
