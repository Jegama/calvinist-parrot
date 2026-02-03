// app/api/prayer-tracker/overview/route.ts
// Phase 4: Dashboard overview endpoint for the "spiritual health hub" tab
// Returns aggregate stats from Prayer Tracker, Journal, and Kids Discipleship
// Privacy: Only returns aggregate data, no individual journal entry links

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";

interface OverviewStats {
  prayer: {
    totalActive: number;
    totalAnswered: number;
    householdActive: number;
    familyActive: number;
    lastPrayedAt: string | null;
    fromJournalCount: number;
    fromKidsCount: number;
  };
  journal: {
    totalEntries: number;
    entriesThisMonth: number;
    topTags: Array<{ tag: string; count: number }>;
    lastEntryAt: string | null;
    streakDays: number;
  };
  kids: {
    totalLogs: number;
    logsThisMonth: number;
    nurtureCount: number;
    admonitionCount: number;
    childrenCount: number;
    lastLogAt: string | null;
  };
  // Household-wide tag aggregation for "Consider praying for" section
  householdPrayerFocus: {
    topTags: Array<{ tag: string; count: number; category: string }>;
    periodDays: number; // How many days this aggregates (e.g., 90)
  };
}

export async function GET() {
  const { errorResponse, userId } = await requireAuthenticatedUser();
  if (errorResponse || !userId) {
    return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile (needed for journal entries which use profile.id as authorProfileId)
  const profile = await prisma.userProfile.findUnique({
    where: { appwriteUserId: userId },
  });

  if (!profile) {
    return NextResponse.json({
      hasHousehold: false,
      stats: null,
    });
  }

  // Get user's household membership
  const membership = await prisma.prayerMember.findFirst({
    where: { appwriteUserId: userId },
  });

  if (!membership) {
    // User has no household - return empty stats
    return NextResponse.json({
      hasHousehold: false,
      stats: null,
    });
  }

  const spaceId = membership.spaceId;
  const profileId = profile.id; // Use profile.id for journal queries
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Parallel queries for efficiency
  const [
    // Prayer stats
    householdActiveCount,
    householdAnsweredCount,
    familyActiveCount,
    familyAnsweredCount,
    householdFromJournalCount,
    householdFromKidsCount,
    lastPrayedRequest,
    // Journal stats
    totalJournalEntries,
    journalEntriesThisMonth,
    journalTags,
    lastJournalEntry,
    // Kids stats
    totalKidsLogs,
    kidsLogsThisMonth,
    nurtureCount,
    admonitionCount,
    childrenWithLogs,
    lastKidsLog,
  ] = await Promise.all([
    // Prayer - household active
    prisma.prayerPersonalRequest.count({
      where: { spaceId, status: "ACTIVE" },
    }),
    // Prayer - household answered
    prisma.prayerPersonalRequest.count({
      where: { spaceId, status: "ANSWERED" },
    }),
    // Prayer - family active (requests linked to families in this space)
    prisma.prayerFamilyRequest.count({
      where: {
        family: { spaceId, archivedAt: null },
        status: "ACTIVE",
      },
    }),
    // Prayer - family answered
    prisma.prayerFamilyRequest.count({
      where: {
        family: { spaceId, archivedAt: null },
        status: "ANSWERED",
      },
    }),
    // Prayer - from journal count (PERSONAL type)
    prisma.prayerPersonalRequest.count({
      where: {
        spaceId,
        linkedJournalEntryId: { not: null },
        linkedEntry: { entryType: "PERSONAL" },
      },
    }),
    // Prayer - from kids count (DISCIPLESHIP type)
    prisma.prayerPersonalRequest.count({
      where: {
        spaceId,
        linkedJournalEntryId: { not: null },
        linkedEntry: { entryType: "DISCIPLESHIP" },
      },
    }),
    // Last prayed request
    prisma.prayerPersonalRequest.findFirst({
      where: { spaceId, lastPrayedAt: { not: null } },
      orderBy: { lastPrayedAt: "desc" },
      select: { lastPrayedAt: true },
    }),
    // Journal - total PERSONAL entries for this user in this household
    prisma.journalEntry.count({
      where: {
        spaceId,
        authorProfileId: profileId,
        entryType: "PERSONAL",
      },
    }),
    // Journal - this month
    prisma.journalEntry.count({
      where: {
        spaceId,
        authorProfileId: profileId,
        entryType: "PERSONAL",
        entryDate: { gte: startOfMonth },
      },
    }),
    // Journal - all tags for aggregation (for user's own entries only)
    prisma.journalEntry.findMany({
      where: {
        spaceId,
        authorProfileId: profileId,
        entryType: "PERSONAL",
      },
      select: { tags: true },
    }),
    // Last journal entry
    prisma.journalEntry.findFirst({
      where: {
        spaceId,
        authorProfileId: profileId,
        entryType: "PERSONAL",
      },
      orderBy: { entryDate: "desc" },
      select: { entryDate: true },
    }),
    // Kids - total DISCIPLESHIP logs in household
    prisma.journalEntry.count({
      where: {
        spaceId,
        entryType: "DISCIPLESHIP",
      },
    }),
    // Kids - this month
    prisma.journalEntry.count({
      where: {
        spaceId,
        entryType: "DISCIPLESHIP",
        entryDate: { gte: startOfMonth },
      },
    }),
    // Kids - nurture count
    prisma.journalEntry.count({
      where: {
        spaceId,
        entryType: "DISCIPLESHIP",
        category: "NURTURE",
      },
    }),
    // Kids - admonition count
    prisma.journalEntry.count({
      where: {
        spaceId,
        entryType: "DISCIPLESHIP",
        category: "ADMONITION",
      },
    }),
    // Kids - distinct children with logs
    prisma.journalEntry.findMany({
      where: {
        spaceId,
        entryType: "DISCIPLESHIP",
        subjectMemberId: { not: null },
      },
      select: { subjectMemberId: true },
      distinct: ["subjectMemberId"],
    }),
    // Last kids log
    prisma.journalEntry.findFirst({
      where: {
        spaceId,
        entryType: "DISCIPLESHIP",
      },
      orderBy: { entryDate: "desc" },
      select: { entryDate: true },
    }),
  ]);

  // Calculate top tags for user's own journal entries
  const tagCounts: Record<string, number> = {};
  for (const entry of journalTags) {
    for (const tag of entry.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  // Calculate household-wide tag aggregation (last 90 days, all members, both PERSONAL and DISCIPLESHIP)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const householdTags = await prisma.journalEntry.findMany({
    where: {
      spaceId,
      entryDate: { gte: ninetyDaysAgo },
    },
    select: { tags: true },
  });

  // Aggregate household tags with category detection
  const householdTagCounts: Record<string, { count: number; category: string }> = {};
  for (const entry of householdTags) {
    for (const tag of entry.tags) {
      if (!householdTagCounts[tag]) {
        householdTagCounts[tag] = { count: 0, category: detectTagCategory(tag) };
      }
      householdTagCounts[tag].count++;
    }
  }

  // Filter to prayer-relevant tags and get top 6
  const prayerRelevantCategories = ["heartIssue", "rulingDesire", "virtue", "circumstance", "theologicalTheme"];
  const householdTopTags = Object.entries(householdTagCounts)
    .filter(([, data]) => prayerRelevantCategories.includes(data.category))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([tag, data]) => ({ tag, count: data.count, category: data.category }));

  // Calculate journal streak (consecutive days with entries)
  const streakDays = await calculateJournalStreak(spaceId, profileId);

  const stats: OverviewStats = {
    prayer: {
      totalActive: householdActiveCount + familyActiveCount,
      totalAnswered: householdAnsweredCount + familyAnsweredCount,
      householdActive: householdActiveCount,
      familyActive: familyActiveCount,
      lastPrayedAt: lastPrayedRequest?.lastPrayedAt?.toISOString() || null,
      fromJournalCount: householdFromJournalCount,
      fromKidsCount: householdFromKidsCount,
    },
    journal: {
      totalEntries: totalJournalEntries,
      entriesThisMonth: journalEntriesThisMonth,
      topTags,
      lastEntryAt: lastJournalEntry?.entryDate?.toISOString() || null,
      streakDays,
    },
    kids: {
      totalLogs: totalKidsLogs,
      logsThisMonth: kidsLogsThisMonth,
      nurtureCount,
      admonitionCount,
      childrenCount: childrenWithLogs.length,
      lastLogAt: lastKidsLog?.entryDate?.toISOString() || null,
    },
    householdPrayerFocus: {
      topTags: householdTopTags,
      periodDays: 90,
    },
  };

  return NextResponse.json({
    hasHousehold: true,
    stats,
  });
}

/**
 * Calculate the current streak of consecutive days with journal entries.
 * Starts from today and counts backwards.
 */
async function calculateJournalStreak(spaceId: string, userId: string): Promise<number> {
  // Get entries from the last 90 days, sorted by date
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const entries = await prisma.journalEntry.findMany({
    where: {
      spaceId,
      authorProfileId: userId,
      entryType: "PERSONAL",
      entryDate: { gte: ninetyDaysAgo },
    },
    select: { entryDate: true },
    orderBy: { entryDate: "desc" },
  });

  if (entries.length === 0) return 0;

  // Create a set of dates (YYYY-MM-DD format) with entries
  const datesWithEntries = new Set<string>();
  for (const entry of entries) {
    const dateStr = entry.entryDate.toISOString().split("T")[0];
    datesWithEntries.add(dateStr);
  }

  // Count consecutive days starting from today
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 90; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const checkDateStr = checkDate.toISOString().split("T")[0];

    if (datesWithEntries.has(checkDateStr)) {
      streak++;
    } else if (i === 0) {
      // If no entry today, check if there was one yesterday to continue the streak
      continue;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Detect the category of a tag based on the allowed values from JOURNAL_CALL2_SYSTEM_PROMPT.
 * Tags may be stored as "category:Value" (e.g., "circumstance:Parenting") or plain values.
 */
function detectTagCategory(tag: string): string {
  // Handle prefixed format (e.g., "circumstance:Parenting")
  if (tag.includes(":")) {
    const [prefix] = tag.split(":");
    // Validate it's a known category
    const knownCategories = ["circumstance", "heartIssue", "rulingDesire", "virtue", "theologicalTheme", "meansOfGrace"];
    if (knownCategories.includes(prefix)) {
      return prefix;
    }
  }

  // Fallback: check if the tag value matches known values
  const categories: Record<string, string[]> = {
    circumstance: ["Work", "Marriage", "Parenting", "Church", "Friendship", "Health", "Finances", "Suffering", "Conflict", "Temptation", "Decision", "Rest", "Time stewardship"],
    heartIssue: ["Anger", "Fear", "Anxiety", "Pride", "People-pleasing", "Control", "Bitterness", "Envy", "Lust", "Sloth", "Self-righteousness", "Unbelief", "Despair", "Shame"],
    rulingDesire: ["Comfort", "Approval", "Power", "Control", "Security", "Success", "Ease", "Reputation"],
    virtue: ["Patience", "Gentleness", "Courage", "Humility", "Contentment", "Gratitude", "Self-control", "Love", "Honesty", "Diligence", "Hope"],
    theologicalTheme: ["Sovereignty", "Providence", "Sanctification", "Justification", "Union with Christ", "Repentance", "Faith", "Adoption", "Perseverance", "Wisdom", "Suffering", "Forgiveness", "Reconciliation"],
    meansOfGrace: ["Scripture", "Prayer", "Lord's Day", "Fellowship", "Accountability", "Confession", "Service"],
  };

  for (const [category, values] of Object.entries(categories)) {
    if (values.includes(tag)) {
      return category;
    }
  }

  return "other";
}
