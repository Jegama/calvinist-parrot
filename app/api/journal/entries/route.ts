// app/api/journal/entries/route.ts
// GET: List entries with filters (date range, tags, text search, pagination)
// POST: Create entry + stream AI results progressively with parallel calls

import { NextResponse } from "next/server";
import { recordEngagement } from "@/lib/analytics/engagement-store";
import prisma from "@/lib/prisma";
import { getMembershipForUser } from "@/lib/householdService";
import { getRecentEntryContext } from "@/utils/journal/llm";
import { processJournalEntry } from "@/utils/journal/process-entry";
import { getPersistedJournalGenerationStatus, type Call1Output, type Call2Output } from "@/types/journal";
import { requireAuthenticatedUser } from "@/lib/auth";

/**
 * GET /api/journal/entries
 * Fetches journal entries with optional filters
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const requestedLimit = parseInt(searchParams.get("limit") || "20", 10);
  const tags = searchParams.get("tags")?.split(",").filter(Boolean);
  const search = searchParams.get("search");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const { userId, errorResponse } = await requireAuthenticatedUser();
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
            modelInfo: true,
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
    generationStatus: getPersistedJournalGenerationStatus(entry.aiOutput),
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
    const { entryText, entryDate } = body;

    const { userId: authenticatedUserId, errorResponse } = await requireAuthenticatedUser();
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

      await recordEngagement("personal_journal", "saved", createdEntry.id, "web", tx);
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
            generationStatus: "pending",
          },
        });

        try {
          await processJournalEntry(entry, recentContext, sendEvent);
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
