import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export async function GET() {
  const [stateRows, denominationRows, overall, confessional] = await Promise.all([
    prisma.churchAddress.findMany({
      where: {
        state: { not: null },
      },
      distinct: ["state"],
      select: { state: true },
      orderBy: { state: "asc" },
    }),
    prisma.church.findMany({
      where: { denominationLabel: { not: null } },
      distinct: ["denominationLabel"],
      select: { denominationLabel: true },
      orderBy: { denominationLabel: "asc" },
    }),
    prisma.church.count(),
    prisma.church.count({ where: { confessionAdopted: true } }),
  ]);

  const states = stateRows
    .map((row) => row.state?.trim())
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));

  const denominations = denominationRows
    .map((row) => row.denominationLabel?.trim())
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));

  const nonConfessional = Math.max(0, overall - confessional);

  return NextResponse.json({
    states,
    denominations,
    totals: {
      overall,
      confessional,
      nonConfessional,
    },
  });
}
