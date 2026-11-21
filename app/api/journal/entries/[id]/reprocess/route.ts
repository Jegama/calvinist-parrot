// app/api/journal/entries/[id]/reprocess/route.ts
// POST: Reprocess AI analysis for an existing journal entry

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRecentEntryContext } from "@/utils/journal/llm";
import { processJournalEntry } from "@/utils/journal/process-entry";
import { getPersistedJournalGenerationStatus } from "@/types/journal";
import { requireAuthenticatedUser } from "@/lib/auth";

/**
 * POST /api/journal/entries/[id]/reprocess
 * Reprocesses the AI analysis for an existing entry (useful when processing failed)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    void request;
    const { id: entryId } = await params;

    const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
    if (errorResponse || !authenticatedUserId)
      return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get user profile
    const profile = await prisma.userProfile.findUnique({
      where: { appwriteUserId: authenticatedUserId },
    });

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Verify the entry exists and belongs to the user
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { aiOutput: true },
    });

    if (
      !entry ||
      entry.entryType !== "PERSONAL" ||
      entry.authorProfileId !== profile.id
    ) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (getPersistedJournalGenerationStatus(entry.aiOutput) === "complete") {
      return NextResponse.json(
        { error: "This journal entry already has a complete AI reflection." },
        { status: 409 }
      );
    }

    // Get rich context from recent entries (situation summaries and themes)
    const recentContext = await getRecentEntryContext(profile.id, 5);

    // Stream the response as JSONL with parallel calls
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };

        try {
          await processJournalEntry(entry, recentContext, sendEvent);
        } catch (aiError) {
          console.error("AI reprocessing failed:", aiError);
          sendEvent({
            type: "error",
            message: "AI processing failed. Please try again.",
          });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error reprocessing journal entry:", error);
    return NextResponse.json(
      { error: "Failed to reprocess journal entry" },
      { status: 500 }
    );
  }
}
