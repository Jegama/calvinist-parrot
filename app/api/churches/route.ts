import { after, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { mapChurchToDetail, mapChurchToListItem } from "@/lib/churchMapper";
import {
  extractChurchEvaluation,
  geocodeAddress,
  postProcessEvaluation,
  toCoreDoctrineStatusEnum,
  toEvaluationStatusEnum,
} from "@/utils/churchEvaluation";
import { CORE_DOCTRINE_KEYS } from "@/lib/schemas/church-finder";
import { isServerAdminUser } from "@/lib/admin";
import type { ChurchEvaluationRaw } from "@/types/church";
import {
  ChurchEvaluationTimeoutError,
  ChurchEvaluationUpstreamError,
  logEvaluationStage,
  measureEvaluationStage,
  runEvaluationStage,
} from "@/lib/church-evaluation/runtime";

const DEFAULT_PAGE_SIZE = 10;
const BACKGROUND_GEOCODING_BUDGET_MS = 20_000;

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
 * Build normalized evaluation data for database persistence
 * This is extracted to avoid duplication between immediate response and background job
 */
function buildEvaluationData(
  rawEvaluation: ChurchEvaluationRaw,
  processed: ReturnType<typeof postProcessEvaluation>
) {
  const churchData = rawEvaluation.church;

  return {
    rawEvaluation: rawEvaluation as unknown as Prisma.JsonObject,
    badges: processed.badges,
    secondary: (churchData.secondary ?? null) as Prisma.InputJsonValue,
    tertiary: (churchData.tertiary ?? null) as Prisma.InputJsonValue,
    coreOnSiteCount: processed.coreOnSiteCount,
    coreTotalCount: CORE_DOCTRINE_KEYS.length,
    coverageRatio: processed.coverageRatio,
    status: toEvaluationStatusEnum(processed.status),
    coreTrinity: toCoreDoctrineStatusEnum(processed.normalizedCore.trinity),
    coreGospel: toCoreDoctrineStatusEnum(processed.normalizedCore.gospel),
    coreJustificationByFaith: toCoreDoctrineStatusEnum(
      processed.normalizedCore.justification_by_faith
    ),
    coreChristDeityHumanity: toCoreDoctrineStatusEnum(
      processed.normalizedCore.christ_deity_humanity
    ),
    coreScriptureAuthority: toCoreDoctrineStatusEnum(
      processed.normalizedCore.scripture_authority
    ),
    coreIncarnationVirginBirth: toCoreDoctrineStatusEnum(
      processed.normalizedCore.incarnation_virgin_birth
    ),
    coreAtonementNecessary: toCoreDoctrineStatusEnum(
      processed.normalizedCore.atonement_necessary_sufficient
    ),
    coreResurrectionOfJesus: toCoreDoctrineStatusEnum(
      processed.normalizedCore.resurrection_of_jesus
    ),
    coreReturnAndJudgment: toCoreDoctrineStatusEnum(
      processed.normalizedCore.return_and_judgment
    ),
    coreCharacterOfGod: toCoreDoctrineStatusEnum(processed.normalizedCore.character_of_god),
  };
}

type PersistedAddressForGeocoding = {
  id: string;
  street1: string | null;
  city: string | null;
  state: string | null;
  postCode: string | null;
};

function scheduleAddressGeocoding(
  persistedAddresses: PersistedAddressForGeocoding[],
): void {
  if (persistedAddresses.length === 0) return;

  after(async () => {
    try {
      await runEvaluationStage({
        stage: "background_geocoding",
        deadlineAt: Date.now() + BACKGROUND_GEOCODING_BUDGET_MS,
        maxDurationMs: BACKGROUND_GEOCODING_BUDGET_MS,
        operation: async (signal) => {
          const geocodedAddresses = await Promise.all(
            persistedAddresses.map(async (address) => ({
              id: address.id,
              coords: await geocodeAddress({
                street1: address.street1,
                city: address.city,
                state: address.state,
                postCode: address.postCode,
              }, signal),
            })),
          );

          await prisma.$transaction(async (tx) => {
            for (const entry of geocodedAddresses) {
              await tx.churchAddress.update({
                where: { id: entry.id },
                data: {
                  latitude: entry.coords.latitude,
                  longitude: entry.coords.longitude,
                },
              });
            }
          });
        },
      });
    } catch (error) {
      console.error("church_geocoding_background_failed", {
        error_name: error instanceof Error ? error.name : "UnknownError",
        address_count: persistedAddresses.length,
      });
    }
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

export async function POST(request: Request) {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const websiteInput = typeof payload.website === "string" ? payload.website.trim() : "";
  if (!websiteInput) {
    return NextResponse.json({ error: "website is required" }, { status: 400 });
  }

  const forceReEvaluate = payload.forceReEvaluate === true;

  let websiteUrl: string;
  try {
    websiteUrl = ensureUrl(websiteInput);
  } catch {
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
  }

  // Check if church already exists
  const existing = await prisma.church.findUnique({
    where: { website: websiteUrl },
    select: { id: true },
  });

  // If church exists and not forcing re-evaluation, return error
  if (existing && !forceReEvaluate) {
    return NextResponse.json(
      {
        error: "Church already exists",
        churchId: existing.id,
        exists: true,
      },
      { status: 409 }
    );
  }

  // If forcing re-evaluation, validate admin permission
  if (forceReEvaluate) {
    const authenticatedUser = await getAuthenticatedUser();

    if (!isServerAdminUser({ request, user: authenticatedUser })) {
      return NextResponse.json(
        { error: "Unauthorized: Only admins can re-evaluate churches" },
        { status: 403 }
      );
    }
  }

  const evaluationStartedAt = Date.now();
  let sourcePageCount = 0;

  try {
    const rawEvaluation: ChurchEvaluationRaw = await extractChurchEvaluation(websiteUrl);
    sourcePageCount = rawEvaluation.metadata?.source_pages.length ?? 0;
    const processed = await measureEvaluationStage({
      stage: "post_processing",
      operation: () => postProcessEvaluation(rawEvaluation),
      dimensions: { sourcePageCount },
    });

    const churchData = rawEvaluation.church;
    const fallbackName = new URL(websiteUrl).hostname.replace(/^www\./, "");
    const churchName = churchData.name?.trim() || fallbackName;

    const addresses = Array.isArray(churchData.addresses) ? churchData.addresses : [];
    const serviceTimes = Array.isArray(churchData.service_times) ? churchData.service_times : [];
    const denominationSignals = Array.isArray(churchData.denomination?.signals)
      ? churchData.denomination.signals
      : [];

    // Build normalized evaluation data once (shared by persistence + response)
    const evaluationData = buildEvaluationData(rawEvaluation, processed);

    const baseData = {
      name: churchName,
      website: websiteUrl,
      phone: churchData.contacts?.phone ?? null,
      email: churchData.contacts?.email ?? null,
      denominationLabel: churchData.denomination?.label ?? null,
      denominationConfidence: churchData.denomination?.confidence ?? null,
      denominationSignals,
      confessionAdopted: churchData.confession?.adopted ?? false,
      confessionName: churchData.confession?.name ?? null,
      confessionSourceUrl: churchData.confession?.source_url ?? null,
      bestBeliefsUrl: churchData.best_pages_for?.beliefs ?? null,
      bestConfessionUrl: churchData.best_pages_for?.confession ?? null,
      bestAboutUrl: churchData.best_pages_for?.about ?? null,
      bestLeadershipUrl: churchData.best_pages_for?.leadership ?? null,
    };

    const persisted = await measureEvaluationStage({
      stage: "persistence",
      dimensions: { sourcePageCount },
      operation: async () => {
        const { churchId } = await prisma.$transaction(async (tx) => {
          const existingChurch = await tx.church.findUnique({
            where: { website: websiteUrl },
            select: { id: true },
          });

          let persistedChurchId: string;

          if (existingChurch) {
            persistedChurchId = existingChurch.id;
            await tx.church.update({
              where: { id: persistedChurchId },
              data: baseData,
            });
            await tx.churchAddress.deleteMany({
              where: { churchId: persistedChurchId },
            });
            await tx.churchServiceTime.deleteMany({
              where: { churchId: persistedChurchId },
            });
          } else {
            const createdChurch = await tx.church.create({ data: baseData });
            persistedChurchId = createdChurch.id;
          }

          for (const [index, address] of addresses.entries()) {
            await tx.churchAddress.create({
              data: {
                churchId: persistedChurchId,
                street1: address.street_1 ?? null,
                street2: address.street_2 ?? null,
                city: address.city ?? null,
                state: address.state ?? null,
                postCode: address.post_code ?? null,
                latitude: null,
                longitude: null,
                sourceUrl: address.source_url ?? null,
                isPrimary: index === 0,
              },
            });
          }

          for (const label of serviceTimes) {
            await tx.churchServiceTime.create({
              data: {
                churchId: persistedChurchId,
                label,
              },
            });
          }

          await tx.churchEvaluation.create({
            data: {
              churchId: persistedChurchId,
              ...evaluationData,
            },
          });

          return { churchId: persistedChurchId };
        });

        const savedChurch = await prisma.church.findUnique({
          where: { id: churchId },
          include: {
            addresses: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            },
            serviceTimes: { orderBy: { createdAt: "asc" } },
            evaluations: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });

        if (!savedChurch) {
          throw new Error("Unable to persist church");
        }

        return savedChurch;
      },
    });

    scheduleAddressGeocoding(persisted.addresses);
    logEvaluationStage({
      stage: "total",
      status: "success",
      startedAt: evaluationStartedAt,
      dimensions: { sourcePageCount },
    });
    return NextResponse.json(mapChurchToDetail(persisted));
  } catch (error) {
    logEvaluationStage({
      stage: "total",
      status: error instanceof ChurchEvaluationTimeoutError
        ? "timeout"
        : "error",
      startedAt: evaluationStartedAt,
      dimensions: { sourcePageCount },
      error,
    });
    console.error("church_evaluation_request_failed", {
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_code: error instanceof ChurchEvaluationTimeoutError ||
          error instanceof ChurchEvaluationUpstreamError
        ? error.code
        : undefined,
      stage: error instanceof ChurchEvaluationTimeoutError ||
          error instanceof ChurchEvaluationUpstreamError
        ? error.stage
        : undefined,
    });

    const errorMessage = error instanceof Error ? error.message : "Unable to evaluate church at this time";

    if (error instanceof ChurchEvaluationTimeoutError) {
      return NextResponse.json(
        {
          error: "Church evaluation timed out while waiting for an upstream service. Please try again.",
          code: error.code,
          stage: error.stage,
        },
        { status: 504 },
      );
    }

    if (error instanceof ChurchEvaluationUpstreamError) {
      return NextResponse.json(
        {
          error: "An upstream service could not complete the church evaluation. Please try again.",
          code: error.code,
          stage: error.stage,
        },
        { status: 502 },
      );
    }

    if (errorMessage.includes("Unable to gather website content")) {
      return NextResponse.json(
        {
          error: "Could not access the church website. The site may be blocking crawlers, offline, or require authentication. Please verify the URL and try again."
        },
        { status: 422 }
      );
    }

    if (
      errorMessage.includes("TAVILY_API_KEY") ||
      errorMessage.includes("GEMINI_API_KEY")
    ) {
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 });
    }

    return NextResponse.json(
      { error: errorMessage.length < 200 ? errorMessage : "Unable to evaluate church at this time" },
      { status: 500 }
    );
  }
}
