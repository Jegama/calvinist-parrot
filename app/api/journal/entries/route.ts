// app/api/journal/entries/route.ts
// GET: List entries with filters (date range, tags, text search, pagination)
// POST: Create entry + stream AI results progressively with parallel calls

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMembershipForUser } from "@/lib/householdService";
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
import type { Call1Output, Call2Output, Call1aOutput } from "@/types/journal";
import { requireAuthenticatedUser } from "@/lib/auth";

/**
 * GET /api/journal/entries
 * Fetches journal entries with optional filters
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const requestedLimit = parseInt(searchParams.get("limit") || "20", 10);
  const tags = searchParams.get("tags")?.split(",").filter(Boolean);
  const search = searchParams.get("search");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 20;

  // Get user profile
  const profile = await prisma.userProfile.findUnique({
    where: { appwriteUserId: userId },
  });

  if (!profile) {
    return NextResponse.json({ entries: [], total: 0 });
  }

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    authorProfileId: profile.id,
    entryType: "PERSONAL",
  };

  if (tags && tags.length > 0) {
    where.tags = { hasSome: tags };
  }

  if (search) {
    where.entryText = { contains: search, mode: "insensitive" };
  }

  if (startDate || endDate) {
    where.entryDate = {};
    if (startDate) where.entryDate.gte = new Date(startDate);
    if (endDate) where.entryDate.lte = new Date(endDate);
  }

  // Fetch entries with pagination
  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: {
        aiOutput: {
          select: {
            call1: true,
            call2: true,
          },
        },
      },
      orderBy: { entryDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.journalEntry.count({ where }),
  ]);

  // Transform for response
  const transformedEntries = entries.map((entry) => ({
    id: entry.id,
    entryDate: entry.entryDate.toISOString(),
    entryText: entry.entryText,
    tags: entry.tags,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    aiOutput: entry.aiOutput
      ? {
        call1: entry.aiOutput.call1 as Call1Output | null,
        call2: entry.aiOutput.call2 as Call2Output | null,
      }
      : null,
  }));

  return NextResponse.json({
    entries: transformedEntries,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * POST /api/journal/entries
 * Creates a new journal entry and triggers AI processing with streaming
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, entryText, entryDate } = body;

    const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser(userId);
    if (errorResponse || !authenticatedUserId)
      return errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!entryText) {
      return NextResponse.json(
        { error: "Missing entryText" },
        { status: 400 }
      );
    }

    const wordCount = entryText.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 15) {
      return NextResponse.json(
        { error: "Entry text is too short. Please write at least a few words describing what happened." },
        { status: 400 }
      );
    }
    if (wordCount > 2000) {
      return NextResponse.json(
        { error: "Entry text is too long. Please keep it under 2,000 words." },
        { status: 400 }
      );
    }

    // Get user profile
    const profile = await prisma.userProfile.findUnique({
      where: { appwriteUserId: authenticatedUserId },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Get household membership (optional)
    const membership = await getMembershipForUser(authenticatedUserId);
    const spaceId = membership?.spaceId || null;

    // Create the entry and increment the counter atomically
    const entry = await prisma.$transaction(async (tx) => {
      const createdEntry = await tx.journalEntry.create({
        data: {
          authorProfileId: profile.id,
          spaceId,
          entryText,
          entryDate: entryDate ? new Date(entryDate) : new Date(),
          entryType: "PERSONAL",
          tags: [],
        },
      });

      await tx.userProfile.update({
        where: { id: profile.id },
        data: { journalEntriesCount: { increment: 1 } },
      });

      return createdEntry;
    });

    // Get rich context from recent entries (situation summaries and themes)
    const recentContext = await getRecentEntryContext(profile.id, 5);

    // Stream the response as JSONL with parallel calls
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };

        // Send entry created event immediately
        sendEvent({
          type: "entry_created",
          entry: {
            id: entry.id,
            entryDate: entry.entryDate.toISOString(),
            entryText: entry.entryText,
            tags: entry.tags,
            createdAt: entry.createdAt.toISOString(),
            updatedAt: entry.updatedAt.toISOString(),
            aiOutput: null,
          },
        });

        // Send progress for Call 1a (fast first paint)
        sendEvent({
          type: "progress",
          stage: "call1a",
          message: "Understanding your entry...",
        });

        try {
          // STEP 1: Run Call 1a first (title, summary, situation)
          const call1a: Call1aOutput = await runCall1a({
            entryText,
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
              entryText,
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
              entryText,
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
              entryText,
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
          });

          const hasFailures = !call1bResult || !call1cResult || !call2Result;

          // Send done event
          sendEvent({
            type: "done",
            call1: fullCall1,
            call2,
            ...(hasFailures && { partial: true }),
          });
        } catch (aiError) {
          console.error("AI processing failed:", aiError);
          sendEvent({
            type: "error",
            message: "AI processing failed. You can retry later.",
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
    console.error("Error creating journal entry:", error);
    return NextResponse.json(
      { error: "Failed to create journal entry" },
      { status: 500 }
    );
  }
}
