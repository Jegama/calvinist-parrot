// app/api/kids-discipleship/logs/route.ts
// GET: List logs for a child with filters (date range, category)
// POST: Create log + stream AI results progressively

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { assertHouseholdAccess } from "@/lib/householdService";
import {
  buildPromptContext,
  runKidsCall1,
  runKidsCall2,
  storeKidsAIOutput,
  flattenKidsTags,
  getCurrentAnnualPlan,
} from "@/utils/kids-discipleship/llm";
import type { LogCategory } from "@prisma/client";

// Local helper for streaming JSON events
function streamEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
}

/**
 * GET /api/kids-discipleship/logs
 * Query params: userId, memberId, category?, startDate?, endDate?, page?, limit?
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const memberId = searchParams.get("memberId");
  const category = searchParams.get("category") as LogCategory | null;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const requestedLimit = parseInt(searchParams.get("limit") || "20", 10);

  if (!userId || !memberId) {
    return NextResponse.json(
      { error: "Missing userId or memberId" },
      { status: 400 }
    );
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  // Verify the child belongs to user's household
  const child = await prisma.prayerMember.findUnique({
    where: { id: memberId },
    select: { spaceId: true, isChild: true, displayName: true },
  });

  if (!child || !child.isChild) {
    return NextResponse.json(
      { error: "Child member not found" },
      { status: 404 }
    );
  }

  try {
    await assertHouseholdAccess(userId, child.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const limit = Math.min(Math.max(requestedLimit, 1), 50);

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    subjectMemberId: memberId,
    entryType: "DISCIPLESHIP",
  };

  if (category) {
    where.category = category;
  }

  if (startDate || endDate) {
    where.entryDate = {};
    if (startDate) where.entryDate.gte = new Date(startDate);
    if (endDate) where.entryDate.lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
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

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      entryDate: log.entryDate.toISOString(),
      entryText: log.entryText,
      category: log.category,
      gospelConnection: log.gospelConnection,
      tags: log.tags,
      createdAt: log.createdAt.toISOString(),
      aiOutput: log.aiOutput
        ? {
            call1: log.aiOutput.call1,
            call2: log.aiOutput.call2,
          }
        : null,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * POST /api/kids-discipleship/logs
 * Body: { userId, memberId, category, entryText, gospelConnection? }
 * Creates a log entry and streams AI reflection
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { userId, memberId, category, entryText, gospelConnection } = body;

  if (!userId || !memberId || !category || !entryText) {
    return NextResponse.json(
      { error: "Missing required fields: userId, memberId, category, entryText" },
      { status: 400 }
    );
  }

  if (!["NURTURE", "ADMONITION"].includes(category)) {
    return NextResponse.json(
      { error: "Invalid category. Must be NURTURE or ADMONITION" },
      { status: 400 }
    );
  }

  const wordCount = entryText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) {
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

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  // Get user profile
  const profile = await prisma.userProfile.findUnique({
    where: { appwriteUserId: userId },
    select: { id: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  // Verify the child belongs to user's household
  const child = await prisma.prayerMember.findUnique({
    where: { id: memberId },
    select: { id: true, spaceId: true, isChild: true, displayName: true, birthdate: true },
  });

  if (!child || !child.isChild) {
    return NextResponse.json(
      { error: "Child member not found" },
      { status: 404 }
    );
  }

  if (!child.birthdate) {
    return NextResponse.json(
      { error: "Child birthdate is required for Heritage Journal. Please add a birthdate in Family Space settings." },
      { status: 400 }
    );
  }

  try {
    await assertHouseholdAccess(userId, child.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Create the streaming response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Create the journal entry
        const entry = await prisma.journalEntry.create({
          data: {
            spaceId: child.spaceId,
            authorProfileId: profile.id,
            entryText,
            entryType: "DISCIPLESHIP",
            category: category as LogCategory,
            subjectMemberId: memberId,
            gospelConnection: gospelConnection || null,
            tags: [],
          },
        });

        streamEvent(controller, {
          type: "entry_created",
          entry: {
            id: entry.id,
            entryDate: entry.entryDate.toISOString(),
            entryText: entry.entryText,
            category: entry.category,
            gospelConnection: entry.gospelConnection,
          },
        });

        // Get current annual plan for context
        const annualPlan = await getCurrentAnnualPlan(memberId);

        // Build prompt context
        const promptContext = buildPromptContext({
          childId: child.id,
          childName: child.displayName,
          childBirthdate: child.birthdate!,
          category: category as LogCategory,
          entryText,
          gospelConnection: gospelConnection || null,
          characterGoal: annualPlan?.characterGoal || null,
          competencyGoal: annualPlan?.competencyGoal || null,
        });

        streamEvent(controller, {
          type: "progress",
          stage: "call1",
          message: "Generating shepherding reflection...",
        });

        // Run Call 1
        const { output: call1, model: call1Model } = await runKidsCall1(promptContext);

        streamEvent(controller, {
          type: "call1_complete",
          call1,
        });

        streamEvent(controller, {
          type: "progress",
          stage: "call2",
          message: "Analyzing tags and prayer suggestions...",
        });

        // Run Call 2
        const call2 = await runKidsCall2({
          ...promptContext,
          call1Summary: call1.summary,
        });

        streamEvent(controller, {
          type: "call2_complete",
          call2,
        });

        // Store AI output
        await storeKidsAIOutput(entry.id, call1, call2, call1Model);

        // Update entry tags
        const tags = flattenKidsTags(call2);
        await prisma.journalEntry.update({
          where: { id: entry.id },
          data: { tags },
        });

        streamEvent(controller, {
          type: "done",
          entry: {
            id: entry.id,
            entryDate: entry.entryDate.toISOString(),
            entryText: entry.entryText,
            category: entry.category,
            gospelConnection: entry.gospelConnection,
            tags,
          },
          call1,
          call2,
        });

        controller.close();
      } catch (error) {
        console.error("Error creating kids log:", error);
        streamEvent(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
