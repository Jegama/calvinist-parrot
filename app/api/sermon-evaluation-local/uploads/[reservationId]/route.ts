import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { requireSermonEvaluationAccess } from "@/lib/sermon-evaluation/auth";
import { writeLocalSermonAudio } from "@/lib/sermon-evaluation/local-storage";
import { isLocalSermonRuntime } from "@/lib/sermon-evaluation/runtime";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ reservationId: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  if (!isLocalSermonRuntime()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const auth = await requireSermonEvaluationAccess();
  if (auth.errorResponse || !auth.userId) {
    return auth.errorResponse ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cross-origin uploads are not allowed" }, { status: 403 });
  }
  const { reservationId } = await params;
  const reservation = await prisma.sermonUploadReservation.findFirst({
    where: {
      id: reservationId,
      ownerId: auth.userId,
      state: "PREPARED",
      expiresAt: { gt: new Date() },
    },
  });
  if (!reservation) {
    return NextResponse.json(
      { error: "The upload reservation is invalid or expired" },
      { status: 409 },
    );
  }
  if (request.headers.get("x-sermon-file-id") !== reservation.appwriteFileId) {
    return NextResponse.json(
      { error: "The local upload file identifier does not match its reservation" },
      { status: 409 },
    );
  }
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength =
    contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength !== reservation.byteSize
  ) {
    return NextResponse.json(
      { error: "The local upload byte size does not match its reservation" },
      { status: 409 },
    );
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (!contentType || contentType !== reservation.mimeType || !contentType.startsWith("audio/")) {
    return NextResponse.json(
      { error: "The local upload MIME type does not match its reservation" },
      { status: 409 },
    );
  }
  if (!request.body) {
    return NextResponse.json({ error: "The upload body is required" }, { status: 400 });
  }

  try {
    await writeLocalSermonAudio({
      fileId: reservation.appwriteFileId,
      ownerId: auth.userId,
      originalFilename: reservation.originalFilename,
      mimeType: reservation.mimeType,
      expectedByteSize: reservation.byteSize,
      body: request.body,
    });
    return NextResponse.json({ fileId: reservation.appwriteFileId }, { status: 201 });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    if (code === "EEXIST") {
      return NextResponse.json(
        { error: "This upload reservation already has a local file" },
        { status: 409 },
      );
    }
    console.error("Local sermon audio upload failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The local upload failed" },
      { status: 400 },
    );
  }
}
