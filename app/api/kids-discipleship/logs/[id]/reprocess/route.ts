// POST: Reprocess AI analysis for an existing Heritage Journal entry

import { NextResponse } from "next/server";
import type { LogCategory } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { assertHouseholdAccess } from "@/lib/householdService";
import {
  buildPromptContext,
  flattenKidsTags,
  getCurrentAnnualPlan,
  runKidsCall1,
  runKidsCall2,
  storeKidsAIOutput,
} from "@/utils/kids-discipleship/llm";

function streamEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: object
) {
  controller.enqueue(
    new TextEncoder().encode(`${JSON.stringify(event)}\n`)
  );
}

/**
 * POST /api/kids-discipleship/logs/[id]/reprocess
 * Re-runs the full AI pipeline for an existing Heritage Journal entry.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;
  const { id } = await params;

  const { userId, errorResponse } = await requireAuthenticatedUser();
  if (errorResponse) return errorResponse;

  const log = await prisma.journalEntry.findUnique({
    where: { id },
    select: {
      id: true,
      entryType: true,
      entryDate: true,
      entryText: true,
      category: true,
      subjectMemberId: true,
      gospelConnection: true,
      aiOutput: {
        select: {
          call1: true,
          call2: true,
        },
      },
    },
  });

  if (!log || log.entryType !== "DISCIPLESHIP") {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  if (!log.subjectMemberId || !log.category) {
    return NextResponse.json({ error: "Invalid log entry" }, { status: 400 });
  }

  const child = await prisma.prayerMember.findUnique({
    where: { id: log.subjectMemberId },
    select: {
      id: true,
      spaceId: true,
      isChild: true,
      displayName: true,
      birthdate: true,
    },
  });

  if (!child || !child.isChild) {
    return NextResponse.json({ error: "Child member not found" }, { status: 404 });
  }

  if (!child.birthdate) {
    return NextResponse.json(
      {
        error:
          "Child birthdate is required for Heritage Journal. Please add a birthdate in Family Space settings.",
      },
      { status: 400 }
    );
  }

  try {
    await assertHouseholdAccess(userId, child.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (log.aiOutput?.call1 && log.aiOutput.call2) {
    return NextResponse.json(
      { error: "This log already has a complete shepherding reflection." },
      { status: 409 }
    );
  }

  const annualPlan = await getCurrentAnnualPlan(child.id);
  const promptContext = buildPromptContext({
    childId: child.id,
    childName: child.displayName,
    childBirthdate: child.birthdate,
    category: log.category as LogCategory,
    entryText: log.entryText,
    gospelConnection: log.gospelConnection,
    characterGoal: annualPlan?.characterGoal || null,
    competencyGoal: annualPlan?.competencyGoal || null,
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        streamEvent(controller, {
          type: "progress",
          stage: "call1",
          message: "Regenerating shepherding reflection...",
        });

        const { output: call1, model: call1Model } =
          await runKidsCall1(promptContext);

        streamEvent(controller, { type: "call1_complete", call1 });
        streamEvent(controller, {
          type: "progress",
          stage: "call2",
          message: "Analyzing tags and prayer suggestions...",
        });

        const call2 = await runKidsCall2({
          ...promptContext,
          call1Summary: call1.summary,
        });

        streamEvent(controller, { type: "call2_complete", call2 });

        await storeKidsAIOutput(log.id, call1, call2, call1Model);

        const tags = flattenKidsTags(call2);
        await prisma.journalEntry.update({
          where: { id: log.id },
          data: { tags },
        });

        streamEvent(controller, {
          type: "done",
          entry: {
            id: log.id,
            entryDate: log.entryDate.toISOString(),
            entryText: log.entryText,
            category: log.category,
            gospelConnection: log.gospelConnection,
            tags,
          },
          call1,
          call2,
        });
      } catch (error) {
        console.error("Error reprocessing kids log:", error);
        streamEvent(controller, {
          type: "error",
          message: "AI processing failed. Please try again.",
        });
      } finally {
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
