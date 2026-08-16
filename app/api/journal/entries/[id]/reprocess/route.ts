// app/api/journal/entries/[id]/reprocess/route.ts
// POST: Reprocess AI analysis for an existing journal entry

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  runCall1a,
  runCall1b,
  runCall1c,
  runTagsAndSuggestions,
  getRecentEntryContext,
  storeJournalAIOutput,
  DEFAULT_CALL1B,
  DEFAULT_CALL1C,
  DEFAULT_CALL2,
} from "@/utils/journal/llm";
import {
  getPersistedJournalGenerationStatus,
  type Call1Output,
  type Call2Output,
  type Call1aOutput,
  type JournalGenerationStage,
} from "@/types/journal";
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
          // Each call catches its own errors so one failure doesn't lose the others
          const [call1bResult, call1cResult, call2Result] = await Promise.all([
            runCall1b({
              entryText: entry.entryText,
              situationSummary: call1a.situationSummary,
              recentContext,
            }).then(({ output, model }) => {
              sendEvent({ type: "call1b_complete", call1b: output });
              return { output, model };
            }).catch((err) => {
              console.error("Call 1b failed:", err);
              sendEvent({ type: "call1b_error", message: "Heart analysis unavailable" });
              return null;
            }),
            runCall1c({
              entryText: entry.entryText,
              situationSummary: call1a.situationSummary,
              recentContext,
            }).then(({ output, model }) => {
              sendEvent({ type: "call1c_complete", call1c: output });
              return { output, model };
            }).catch((err) => {
              console.error("Call 1c failed:", err);
              sendEvent({ type: "call1c_error", message: "Biblical guidance unavailable" });
              return null;
            }),
            runTagsAndSuggestions({
              entryText: entry.entryText,
              call1Summary: call1a.oneSentenceSummary,
            }).then((result: Call2Output) => {
              sendEvent({ type: "call2_complete", call2: result });
              return result;
            }).catch((err) => {
              console.error("Call 2 failed:", err);
              sendEvent({ type: "call2_error", message: "Tags and prayer suggestions unavailable" });
              return null;
            }),
          ]);

          const call1b = call1bResult?.output ?? DEFAULT_CALL1B;
          const call1c = call1cResult?.output ?? DEFAULT_CALL1C;
          const call2 = call2Result ?? DEFAULT_CALL2;
          const call1bModel = call1bResult?.model ?? "unknown";
          const call1cModel = call1cResult?.model ?? "unknown";
          const failedStages: JournalGenerationStage[] = [];
          if (!call1bResult) failedStages.push("call1b");
          if (!call1cResult) failedStages.push("call1c");
          if (!call2Result) failedStages.push("call2");

          // Combine Call 1 results
          const fullCall1: Call1Output = {
            ...call1a,
            ...call1b,
            ...call1c,
          };

          // Store AI output (with whatever succeeded)
          await storeJournalAIOutput({
            entryId: entry.id,
            call1: fullCall1,
            call2,
            models: { call1bModel, call1cModel },
            failedStages,
          });

          const hasFailures = failedStages.length > 0;

          // Send done event
          sendEvent({
            type: "done",
            call1: fullCall1,
            call2,
            ...(hasFailures && { partial: true, failedStages }),
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
