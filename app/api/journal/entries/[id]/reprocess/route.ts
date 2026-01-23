// app/api/journal/entries/[id]/reprocess/route.ts
// POST: Reprocess AI analysis for an existing journal entry

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  runCall1a,
  runCall1b,
  runCall1c,
  runTagsAndSuggestions,
  getPreferredDepth,
  getRecentEntrySummaries,
  storeJournalAIOutput,
} from "@/utils/journal/llm";
import type { Call1Output, Call2Output, Call1aOutput, Call1bOutput, Call1cOutput } from "@/types/journal";
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
    const { id: entryId } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(userId);
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
    });

    if (!entry || entry.authorProfileId !== profile.id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Get preferred depth and recent summaries
    const preferredDepth = await getPreferredDepth(profile.id);
    const recentSummaries = await getRecentEntrySummaries(profile.id, 3);

    // Stream the response as JSONL with parallel calls
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };

        // Send progress for Call 1a
        sendEvent({
          type: "progress",
          stage: "call1a",
          message: "Reprocessing entry...",
        });

        try {
          // STEP 1: Run Call 1a first (title, summary, situation)
          const call1a: Call1aOutput = await runCall1a({
            entryText: entry.entryText,
            recentSummaries,
            preferredDepth,
          });

          // Send Call 1a result immediately
          sendEvent({
            type: "call1a_complete",
            call1a,
          });

          // Now run 1b, 1c, and Call 2 in parallel
          sendEvent({
            type: "progress",
            stage: "parallel",
            message: "Analyzing heart and gathering Scripture...",
          });

          // STEP 2: Run Call 1b, 1c, and Call 2 in parallel
          const [call1b, call1c, call2] = await Promise.all([
            runCall1b({
              entryText: entry.entryText,
              situationSummary: call1a.situationSummary,
              preferredDepth,
            }).then((result: Call1bOutput) => {
              sendEvent({
                type: "call1b_complete",
                call1b: result,
              });
              return result;
            }),
            runCall1c({
              entryText: entry.entryText,
              situationSummary: call1a.situationSummary,
              preferredDepth,
            }).then((result: Call1cOutput) => {
              sendEvent({
                type: "call1c_complete",
                call1c: result,
              });
              return result;
            }),
            runTagsAndSuggestions({
              entryText: entry.entryText,
              call1Summary: call1a.oneSentenceSummary,
            }).then((result: Call2Output) => {
              sendEvent({
                type: "call2_complete",
                call2: result,
              });
              return result;
            }),
          ]);

          // Combine Call 1 results
          const fullCall1: Call1Output = {
            ...call1a,
            ...call1b,
            ...call1c,
          };

          // Store final AI output (with automatic retry)
          await storeJournalAIOutput({
            entryId: entry.id,
            call1: fullCall1,
            call2,
          });

          // Send done event
          sendEvent({
            type: "done",
            call1: fullCall1,
            call2,
          });
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
