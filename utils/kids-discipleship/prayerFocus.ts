// utils/kids-discipleship/prayerFocus.ts
// Derives prayer focus and praise items from recent Kids Discipleship logs
// Phase 3: Display only (promotion to Prayer Tracker in Phase 4)

import prisma from "@/lib/prisma";
import { LogCategory } from "@prisma/client";
import type { KidsCall2Output } from "@/lib/prompts/kids-discipleship";

export interface PrayerFocusItem {
  title: string;
  notes: string;
  linkedScripture: string | null;
  sourceEntryId: string;
  sourceEntryDate: Date;
  sourceCategory: "NURTURE" | "ADMONITION";
  sourceSnippet: string;
}

export interface DerivedPrayerFocus {
  prayerNeeds: PrayerFocusItem[]; // From ADMONITION logs (struggles needing prayer)
  praises: PrayerFocusItem[]; // From NURTURE logs (wins to thank God for)
}

/**
 * Derive prayer focus items for a child from recent logs
 * @param memberId - The child's prayerMember ID
 * @param daysBack - How many days back to look (default 30)
 */
export async function derivePrayerFocus(
  memberId: string,
  daysBack: number = 30
): Promise<DerivedPrayerFocus> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  // Fetch recent discipleship logs for this child with AI output
  const logs = await prisma.journalEntry.findMany({
    where: {
      subjectMemberId: memberId,
      entryType: "DISCIPLESHIP",
      entryDate: { gte: cutoffDate },
    },
    include: {
      aiOutput: {
        select: {
          call2: true,
        },
      },
    },
    orderBy: { entryDate: "desc" },
    take: 50, // Limit to prevent too many results
  });

  const prayerNeeds: PrayerFocusItem[] = [];
  const praises: PrayerFocusItem[] = [];

  for (const log of logs) {
    const call2 = log.aiOutput?.call2 as KidsCall2Output | null;
    if (!call2?.suggestedChildPrayerRequests) continue;

    const sourceSnippet =
      log.entryText.length > 100
        ? log.entryText.slice(0, 100) + "..."
        : log.entryText;

    for (const request of call2.suggestedChildPrayerRequests) {
      const item: PrayerFocusItem = {
        title: request.title,
        notes: request.notes,
        linkedScripture: request.linkedScripture,
        sourceEntryId: log.id,
        sourceEntryDate: log.entryDate,
        sourceCategory: log.category as "NURTURE" | "ADMONITION",
        sourceSnippet,
      };

      // ADMONITION logs → prayer needs (struggles)
      // NURTURE logs → praises (wins)
      if (log.category === LogCategory.ADMONITION) {
        prayerNeeds.push(item);
      } else if (log.category === LogCategory.NURTURE) {
        praises.push(item);
      }
    }
  }

  // Limit to 6 items each (newest first since logs are ordered by date DESC)
  const MAX_ITEMS = 6;
  return {
    prayerNeeds: prayerNeeds.slice(0, MAX_ITEMS),
    praises: praises.slice(0, MAX_ITEMS),
  };
}

/**
 * Get summary stats for a child's recent logs
 */
export async function getLogStats(
  memberId: string,
  daysBack: number = 30
): Promise<{
  nurtureCount: number;
  admonitionCount: number;
  topHeartIssues: string[];
  topVirtues: string[];
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const logs = await prisma.journalEntry.findMany({
    where: {
      subjectMemberId: memberId,
      entryType: "DISCIPLESHIP",
      entryDate: { gte: cutoffDate },
    },
    include: {
      aiOutput: {
        select: {
          call2: true,
        },
      },
    },
  });

  let nurtureCount = 0;
  let admonitionCount = 0;
  const heartIssueCounts: Record<string, number> = {};
  const virtueCounts: Record<string, number> = {};

  for (const log of logs) {
    if (log.category === LogCategory.NURTURE) nurtureCount++;
    if (log.category === LogCategory.ADMONITION) admonitionCount++;

    const call2 = log.aiOutput?.call2 as KidsCall2Output | null;
    if (call2?.tags) {
      // Heart issues primarily from ADMONITION logs (struggles)
      if (log.category === LogCategory.ADMONITION) {
        for (const issue of call2.tags.heartIssue || []) {
          heartIssueCounts[issue] = (heartIssueCounts[issue] || 0) + 1;
        }
      }
      // Virtues primarily from NURTURE logs (wins)
      if (log.category === LogCategory.NURTURE) {
        for (const virtue of call2.tags.virtue || []) {
          virtueCounts[virtue] = (virtueCounts[virtue] || 0) + 1;
        }
      }
    }
  }

  // Get top 3 of each
  const topHeartIssues = Object.entries(heartIssueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  const topVirtues = Object.entries(virtueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  return {
    nurtureCount,
    admonitionCount,
    topHeartIssues,
    topVirtues,
  };
}
