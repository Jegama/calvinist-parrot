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
  getPreferredDepth,
  getRecentEntrySummaries,
  storeJournalAIOutput,
} from "@/utils/journal/llm";
import type { Call1Output, Call2Output, Call1aOutput, Call1bOutput, Call1cOutput } from "@/types/journal";

/**
 * GET /api/journal/entries
 * Fetches journal entries with optional filters
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const tags = searchParams.get("tags")?.split(",").filter(Boolean);
  const search = searchParams.get("search");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

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

    if (!userId || !entryText) {
      return NextResponse.json(
        { error: "Missing userId or entryText" },
        { status: 400 }
      );
    }

    // Get user profile
    const profile = await prisma.userProfile.findUnique({
      where: { appwriteUserId: userId },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Get household membership (optional)
    const membership = await getMembershipForUser(userId);
    const spaceId = membership?.spaceId || null;

    // Create the entry first
    const entry = await prisma.journalEntry.create({
      data: {
        authorProfileId: profile.id,
        spaceId,
        entryText,
        entryDate: entryDate ? new Date(entryDate) : new Date(),
        entryType: "PERSONAL",
        tags: [],
      },
    });

    // Increment journal entries count
    await prisma.userProfile.update({
      where: { id: profile.id },
      data: { journalEntriesCount: { increment: 1 } },
    });

    // Get preferred depth for AI reflection
    const preferredDepth = await getPreferredDepth(profile.id);

    // Get recent summaries for context
    const recentSummaries = await getRecentEntrySummaries(profile.id, 3);

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
              entryText,
              situationSummary: call1a.situationSummary,
              preferredDepth,
            }).then((result: Call1bOutput) => {
              // Send 1b result as soon as it completes
              sendEvent({
                type: "call1b_complete",
                call1b: result,
              });
              return result;
            }),
            runCall1c({
              entryText,
              situationSummary: call1a.situationSummary,
              preferredDepth,
            }).then((result: Call1cOutput) => {
              // Send 1c result as soon as it completes
              sendEvent({
                type: "call1c_complete",
                call1c: result,
              });
              return result;
            }),
            runTagsAndSuggestions({
              entryText,
              call1Summary: call1a.oneSentenceSummary,
            }).then((result: Call2Output) => {
              // Send Call 2 result as soon as it completes
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

          // Store final AI output
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
