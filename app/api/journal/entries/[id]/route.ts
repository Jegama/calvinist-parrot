// app/api/journal/entries/[id]/route.ts
// GET: Entry detail including AI outputs
// PATCH: Update tags/title

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Call1Output, Call2Output } from "@/types/journal";

/**
 * GET /api/journal/entries/[id]
 * Fetches a single journal entry with AI outputs
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

  // Get user profile
  const profile = await prisma.userProfile.findUnique({
    where: { appwriteUserId: userId },
  });

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch entry
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: {
      aiOutput: true,
    },
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // Verify ownership
  if (entry.authorProfileId !== profile.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json({
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
        modelInfo: entry.aiOutput.modelInfo,
        createdAt: entry.aiOutput.createdAt.toISOString(),
      }
      : null,
  });
}

/**
 * PATCH /api/journal/entries/[id]
 * Updates tags on an entry
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { userId, tags } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Get user profile
    const profile = await prisma.userProfile.findUnique({
      where: { appwriteUserId: userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch entry to verify ownership
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.authorProfileId !== profile.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update entry
    const updatedEntry = await prisma.journalEntry.update({
      where: { id },
      data: {
        tags: tags !== undefined ? tags : entry.tags,
      },
    });

    return NextResponse.json({
      id: updatedEntry.id,
      entryDate: updatedEntry.entryDate.toISOString(),
      entryText: updatedEntry.entryText,
      tags: updatedEntry.tags,
      updatedAt: updatedEntry.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Error updating journal entry:", error);
    return NextResponse.json(
      { error: "Failed to update journal entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/journal/entries/[id]
 * Deletes a journal entry
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

  // Get user profile
  const profile = await prisma.userProfile.findUnique({
    where: { appwriteUserId: userId },
  });

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch entry to verify ownership
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (entry.authorProfileId !== profile.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Delete entry (cascade will delete AI output)
  await prisma.journalEntry.delete({
    where: { id },
  });

  // Decrement journal entries count
  await prisma.userProfile.update({
    where: { id: profile.id },
    data: { journalEntriesCount: { decrement: 1 } },
  });

  return NextResponse.json({ success: true });
}
