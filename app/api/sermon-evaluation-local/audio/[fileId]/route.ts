import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { requireSermonEvaluationAccess } from "@/lib/sermon-evaluation/auth";
import { openLocalSermonAudioStream } from "@/lib/sermon-evaluation/local-storage";
import { isLocalSermonRuntime } from "@/lib/sermon-evaluation/runtime";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ fileId: string }> };

function parseRange(value: string | null, size: number) {
  const match = value?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const requestedStart = match[1] ? Number(match[1]) : null;
  const requestedEnd = match[2] ? Number(match[2]) : null;
  let start = requestedStart ?? Math.max(0, size - (requestedEnd ?? 0));
  let end = requestedStart === null ? size - 1 : requestedEnd ?? size - 1;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  return Number.isInteger(start) && Number.isInteger(end) && start <= end
    ? { start, end }
    : null;
}

export async function GET(request: Request, { params }: RouteContext) {
  if (!isLocalSermonRuntime()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const auth = await requireSermonEvaluationAccess();
  if (auth.errorResponse || !auth.userId) {
    return auth.errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { fileId } = await params;
  const asset = await prisma.sermonAudioAsset.findFirst({
    where: {
      appwriteFileId: fileId,
      deletedAt: null,
      evaluations: { some: { ownerId: auth.userId, deletedAt: null } },
    },
    select: { mimeType: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }

  try {
    const audio = await openLocalSermonAudioStream(fileId);
    if (audio.metadata.ownerId !== auth.userId) {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }
    const requestedRange = request.headers.get("range");
    const range = parseRange(requestedRange, audio.size);
    if (requestedRange && !range) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${audio.size}` },
      });
    }
    const start = range?.start;
    const end = range?.end;
    const body = Readable.toWeb(audio.stream(start, end)) as ReadableStream;
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
        "content-length": String(range ? range.end - range.start + 1 : audio.size),
        "content-type": asset.mimeType,
        ...(range
          ? { "content-range": `bytes ${range.start}-${range.end}/${audio.size}` }
          : {}),
      },
    });
  } catch (error) {
    console.error("Local sermon audio playback failed", error);
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }
}
