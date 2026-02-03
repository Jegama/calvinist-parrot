// app/prayer-tracker/components/FromSourceBadge.tsx
// Phase 4: Badge component showing the source of a prayer request
// Privacy-aware: Only renders link if the current user is the journal entry author
// or if the source is a DISCIPLESHIP (kids log) entry

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Baby } from "lucide-react";

interface FromSourceBadgeProps {
  linkedJournalEntryId: string | null | undefined;
  linkedEntryType: "PERSONAL" | "DISCIPLESHIP" | null | undefined;
  subjectMemberId?: string | null;
  childName?: string | null; // For display when subjectMemberId is set
}

/**
 * Displays a badge indicating the source of a prayer request.
 * - "From Journal" for PERSONAL entries (links to /journal)
 * - "From Heritage" for DISCIPLESHIP entries (links to /kids-discipleship)
 * 
 * The API already handles privacy: linkedJournalEntryId is only returned
 * if the current user is the entry author OR the entry is DISCIPLESHIP type.
 * So if we have a linkedJournalEntryId, we can show the badge.
 */
export function FromSourceBadge({
  linkedJournalEntryId,
  linkedEntryType,
  childName,
}: FromSourceBadgeProps) {
  // No link to show if no entry ID
  if (!linkedJournalEntryId || !linkedEntryType) {
    return null;
  }

  const isKidsLog = linkedEntryType === "DISCIPLESHIP";

  // Determine the link destination
  // For journal entries, we could link to the entry detail page if we have one
  // For now, link to the main page - the user can find the entry there
  const href = isKidsLog ? "/kids-discipleship" : "/journal";

  return (
    <Link href={href} className="inline-flex">
      <Badge
        variant="outline"
        className="text-xs gap-1 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
      >
        {isKidsLog ? (
          <>
            <Baby className="h-3 w-3" aria-hidden="true" />
            From Heritage
            {childName && <span className="text-muted-foreground">({childName})</span>}
          </>
        ) : (
          <>
            <BookOpen className="h-3 w-3" aria-hidden="true" />
            From Journal
          </>
        )}
      </Badge>
    </Link>
  );
}
