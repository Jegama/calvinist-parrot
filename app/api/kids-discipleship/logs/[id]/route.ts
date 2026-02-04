// app/api/kids-discipleship/logs/[id]/route.ts
// GET: Get log detail
// PATCH: Update log text (re-runs AI if changed)

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth";
import { assertHouseholdAccess } from "@/lib/householdService";

/**
 * GET /api/kids-discipleship/logs/[id]
 * Query params: userId
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  const log = await prisma.journalEntry.findUnique({
    where: { id },
    include: {
      aiOutput: true,
    },
  });

  if (!log || log.entryType !== "DISCIPLESHIP") {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  // Get the child to verify household access
  if (!log.subjectMemberId) {
    return NextResponse.json({ error: "Invalid log entry" }, { status: 400 });
  }

  const child = await prisma.prayerMember.findUnique({
    where: { id: log.subjectMemberId },
    select: { spaceId: true, displayName: true, birthdate: true },
  });

  if (!child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  try {
    await assertHouseholdAccess(userId, child.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json({
    log: {
      id: log.id,
      entryDate: log.entryDate.toISOString(),
      entryText: log.entryText,
      category: log.category,
      tags: log.tags,
      createdAt: log.createdAt.toISOString(),
      updatedAt: log.updatedAt.toISOString(),
      child: {
        id: log.subjectMemberId,
        displayName: child.displayName,
        birthdate: child.birthdate?.toISOString() ?? null,
      },
      aiOutput: log.aiOutput
        ? {
            call1: log.aiOutput.call1,
            call2: log.aiOutput.call2,
            modelInfo: log.aiOutput.modelInfo,
            createdAt: log.aiOutput.createdAt.toISOString(),
          }
        : null,
    },
  });
}

/**
 * PATCH /api/kids-discipleship/logs/[id]
 * Body: { userId, entryText?, category? }
 * Note: Changing entryText or category does NOT automatically re-run AI
 * Use POST to /reprocess if needed
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { userId, entryText, category } = body;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  const log = await prisma.journalEntry.findUnique({
    where: { id },
    select: {
      id: true,
      entryType: true,
      subjectMemberId: true,
    },
  });

  if (!log || log.entryType !== "DISCIPLESHIP") {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  if (!log.subjectMemberId) {
    return NextResponse.json({ error: "Invalid log entry" }, { status: 400 });
  }

  const child = await prisma.prayerMember.findUnique({
    where: { id: log.subjectMemberId },
    select: { spaceId: true },
  });

  if (!child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  try {
    await assertHouseholdAccess(userId, child.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Build update data
  const updateData: Record<string, unknown> = {};

  if (entryText !== undefined) {
    updateData.entryText = entryText;
  }

  if (category !== undefined) {
    if (!["NURTURE", "ADMONITION"].includes(category)) {
      return NextResponse.json(
        { error: "Invalid category. Must be NURTURE or ADMONITION" },
        { status: 400 }
      );
    }
    updateData.category = category;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updatedLog = await prisma.journalEntry.update({
    where: { id },
    data: updateData,
    include: {
      aiOutput: true,
    },
  });

  return NextResponse.json({
    log: {
      id: updatedLog.id,
      entryDate: updatedLog.entryDate.toISOString(),
      entryText: updatedLog.entryText,
      category: updatedLog.category,
      tags: updatedLog.tags,
      createdAt: updatedLog.createdAt.toISOString(),
      updatedAt: updatedLog.updatedAt.toISOString(),
      aiOutput: updatedLog.aiOutput
        ? {
            call1: updatedLog.aiOutput.call1,
            call2: updatedLog.aiOutput.call2,
          }
        : null,
    },
  });
}

/**
 * DELETE /api/kids-discipleship/logs/[id]
 * Query params: userId
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { errorResponse } = await requireAuthenticatedUser(userId);
  if (errorResponse) return errorResponse;

  const log = await prisma.journalEntry.findUnique({
    where: { id },
    select: {
      id: true,
      entryType: true,
      subjectMemberId: true,
    },
  });

  if (!log || log.entryType !== "DISCIPLESHIP") {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  if (!log.subjectMemberId) {
    return NextResponse.json({ error: "Invalid log entry" }, { status: 400 });
  }

  const child = await prisma.prayerMember.findUnique({
    where: { id: log.subjectMemberId },
    select: { spaceId: true },
  });

  if (!child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  try {
    await assertHouseholdAccess(userId, child.spaceId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Delete the log (AI output will cascade delete)
  await prisma.journalEntry.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
