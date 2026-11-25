import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { mapChurchToListItem } from "@/lib/churchMapper";
import { evaluateChurch } from "@/lib/church-evaluation/submit";

const DEFAULT_PAGE_SIZE = 10;

export const maxDuration = 300;

function parseBooleanParam(value: string | null): boolean | null {
  if (value === null) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

/**
 * Sort churches by status priority:
 * 1. Historic Reformed (confessionAdopted = true)
 * 2. Recommended (latest eval status = RECOMMENDED)
 * 3. Biblically Sound w/ Differences (latest eval status = BIBLICALLY_SOUND_WITH_DIFFERENCES)
 * 4. Limited Information (latest eval status = LIMITED_INFORMATION)
 * 5. Not Endorsed (latest eval status = NOT_ENDORSED)
 * 6. No evaluation (null status)
 * Then alphabetically by name within each group
 */
type EvaluationStatusDb =
  | "RECOMMENDED"
  | "BIBLICALLY_SOUND_WITH_DIFFERENCES"
  | "LIMITED_INFORMATION"
  | "NOT_ENDORSED";

function sortChurchesByPriority<T extends {
  name: string;
  confessionAdopted: boolean;
  evaluations: Array<{ status: EvaluationStatusDb }>;
}>(churches: T[]): T[] {
  return churches.sort((a, b) => {
    // Assign priority values
    const getPriority = (church: T): number => {
      if (church.confessionAdopted) return 1; // Historic Reformed
      if (!church.evaluations[0]) return 6; // No evaluation
      switch (church.evaluations[0].status) {
        case "RECOMMENDED":
          return 2; // Recommended
        case "BIBLICALLY_SOUND_WITH_DIFFERENCES":
          return 3; // Not classic Reformed but affirms essentials
        case "LIMITED_INFORMATION":
          return 4; // Limited Information
        case "NOT_ENDORSED":
          return 5; // Not Endorsed
        default:
          return 6;
      }
    };

    const aPriority = getPriority(a);
    const bPriority = getPriority(b);

    // Sort by priority first
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then alphabetically by name
    return a.name.localeCompare(b.name);
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSizeParam = Number.parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = Number.isNaN(pageSizeParam) || pageSizeParam < 1 ? DEFAULT_PAGE_SIZE : pageSizeParam;

  const state = searchParams.get("state");
  const city = searchParams.get("city");
  const denomination = searchParams.get("denomination");
  const confessional = parseBooleanParam(searchParams.get("confessional"));
  const status = searchParams.get("status"); // "historic_reformed" | "recommended" | "biblically_sound_with_differences" | "limited_information" | "not_endorsed" | "exclude_red_flag_and_limited"

  const addressFilter: Prisma.churchAddressWhereInput = {};
  if (state) {
    addressFilter.state = { equals: state, mode: "insensitive" };
  }
  if (city) {
    addressFilter.city = { equals: city, mode: "insensitive" };
  }

  const where: Prisma.churchWhereInput = {};

  if (Object.keys(addressFilter).length > 0) {
    where.addresses = { some: addressFilter };
  }

  if (typeof confessional === "boolean") {
    where.confessionAdopted = confessional;
  }

  if (denomination) {
    where.denominationLabel = { equals: denomination, mode: "insensitive" };
  }

  // For status filtering, we need to fetch all churches first and filter by latest evaluation
  // since Prisma can't easily filter by "the latest related record"
  const shouldFilterByLatestEval = status && status !== "historic_reformed";

  // Handle historic_reformed filter at query level (it's based on church field, not evaluation)
  if (status === "historic_reformed") {
    where.confessionAdopted = true;
  }

  // If we need to filter by evaluation status, we need to fetch more data and filter in-memory
  if (shouldFilterByLatestEval) {
    // First, get all matching churches with their latest evaluation
    const allChurches = await prisma.church.findMany({
      where,
      include: {
        addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        serviceTimes: { orderBy: { createdAt: "asc" } },
        evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    // Filter by latest evaluation status
    const filteredChurches = allChurches.filter((church) => {
      const latestEval = church.evaluations[0];

      if (status === "exclude_red_flag_and_limited") {
        // Exclude if latest eval is NOT_ENDORSED or LIMITED_INFORMATION
        return !latestEval || (latestEval.status !== "NOT_ENDORSED" && latestEval.status !== "LIMITED_INFORMATION");
      } else if (status === "recommended") {
        return latestEval?.status === "RECOMMENDED";
      } else if (status === "biblically_sound_with_differences") {
        return latestEval?.status === "BIBLICALLY_SOUND_WITH_DIFFERENCES";
      } else if (status === "limited_information") {
        return latestEval?.status === "LIMITED_INFORMATION";
      } else if (status === "not_endorsed") {
        return latestEval?.status === "NOT_ENDORSED";
      }
      return true;
    });

    // Sort by priority, then alphabetically
    const sortedChurches = sortChurchesByPriority(filteredChurches);

    // Apply pagination to filtered and sorted results
    const total = sortedChurches.length;
    const paginatedChurches = sortedChurches.slice((page - 1) * pageSize, page * pageSize);
    const items = paginatedChurches.map((church) => mapChurchToListItem(church));

    return NextResponse.json({
      page,
      pageSize,
      total,
      items,
    });
  }

  // No status filtering (or only historic_reformed), use normal query
  const total = await prisma.church.count({ where });

  const churches = await prisma.church.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      serviceTimes: { orderBy: { createdAt: "asc" } },
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  // Sort by priority, then alphabetically
  const sortedChurches = sortChurchesByPriority(churches);
  const items = sortedChurches.map((church) => mapChurchToListItem(church));

  return NextResponse.json({
    page,
    pageSize,
    total,
    items,
  });
}

export function POST(request: Request) {
  return evaluateChurch(request, "public_api");
}
