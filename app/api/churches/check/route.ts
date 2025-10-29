import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function ensureUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    const prefixed = `https://${value}`;
    const url = new URL(prefixed);
    return url.toString();
  }
}

/**
 * GET /api/churches/check?website=https://example.com
 * Checks if a church already exists in the database by website URL
 * Returns: { exists: boolean, churchId?: string }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteInput = searchParams.get("website");

  if (!websiteInput) {
    return NextResponse.json({ error: "website parameter is required" }, { status: 400 });
  }

  let websiteUrl: string;
  try {
    websiteUrl = ensureUrl(websiteInput);
  } catch {
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
  }

  try {
    const existing = await prisma.church.findUnique({
      where: { website: websiteUrl },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ exists: true, churchId: existing.id });
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    console.error("Error checking church existence:", error);
    return NextResponse.json({ error: "Failed to check church existence" }, { status: 500 });
  }
}
