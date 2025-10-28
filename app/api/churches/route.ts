import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { mapChurchToDetail, mapChurchToListItem } from "@/lib/churchMapper";
import {
  extractChurchEvaluation,
  geocodeAddress,
  postProcessEvaluation,
  toCoreDoctrineStatusEnum,
  toEvaluationStatusEnum,
} from "@/utils/churchEvaluation";
import { CORE_DOCTRINE_KEYS } from "@/lib/schemas/church-finder";
import type { ChurchEvaluationRaw } from "@/types/church";

const DEFAULT_PAGE_SIZE = 10;

function parseBooleanParam(value: string | null): boolean | null {
  if (value === null) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

/**
 * Sort churches by status priority:
 * 1. Historic Reformed (confessionAdopted = true)
 * 2. Recommended (latest eval status = PASS)
 * 3. Caution (latest eval status = CAUTION)
 * 4. Not Endorsed (latest eval status = RED_FLAG)
 * 5. No evaluation (null status)
 * Then alphabetically by name within each group
 */
function sortChurchesByPriority<T extends {
  name: string;
  confessionAdopted: boolean;
  evaluations: Array<{ status: "PASS" | "CAUTION" | "RED_FLAG" }>;
}>(churches: T[]): T[] {
  return churches.sort((a, b) => {
    // Get latest evaluation status
    const aStatus = a.evaluations[0]?.status;
    const bStatus = b.evaluations[0]?.status;

    // Assign priority values
    const getPriority = (church: T): number => {
      if (church.confessionAdopted) return 1; // Historic Reformed
      if (!church.evaluations[0]) return 5; // No evaluation
      switch (church.evaluations[0].status) {
        case "PASS":
          return 2; // Recommended
        case "CAUTION":
          return 3; // Caution
        case "RED_FLAG":
          return 4; // Not Endorsed
        default:
          return 5;
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSize = DEFAULT_PAGE_SIZE;

  const state = searchParams.get("state");
  const city = searchParams.get("city");
  const denomination = searchParams.get("denomination");
  const confessional = parseBooleanParam(searchParams.get("confessional"));
  const status = searchParams.get("status"); // "historic_reformed" | "recommended" | "caution" | "red_flag" | "exclude_red_flag"

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
      
      if (status === "exclude_red_flag") {
        // Exclude if latest eval is RED_FLAG
        return !latestEval || latestEval.status !== "RED_FLAG";
      } else if (status === "recommended") {
        return latestEval?.status === "PASS";
      } else if (status === "caution") {
        return latestEval?.status === "CAUTION";
      } else if (status === "red_flag") {
        return latestEval?.status === "RED_FLAG";
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
  const userId = typeof payload.userId === "string" ? payload.userId : "";

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
    const adminId = process.env.ADMIN_ID;
    if (!adminId || !userId || userId !== adminId) {
      return NextResponse.json(
        { error: "Unauthorized: Only admins can re-evaluate churches" },
        { status: 403 }
      );
    }
  }

  try {
    const rawEvaluation: ChurchEvaluationRaw = await extractChurchEvaluation(websiteUrl);
    const processed = postProcessEvaluation(rawEvaluation);

    const churchData = rawEvaluation.church;
    const fallbackName = new URL(websiteUrl).hostname.replace(/^www\./, "");
    const churchName = churchData.name?.trim() || fallbackName;

    const addresses = Array.isArray(churchData.addresses) ? churchData.addresses : [];
    const serviceTimes = Array.isArray(churchData.service_times) ? churchData.service_times : [];
    const denominationSignals = Array.isArray(churchData.denomination?.signals)
      ? churchData.denomination.signals
      : [];

    // ============================================================================
    // Build ChurchDetail immediately (without geocoding)
    // ============================================================================

    // Build normalized evaluation data once (reused in background job)
    const evaluationData = buildEvaluationData(rawEvaluation, processed);

    const immediateDetail = mapChurchToDetail({
      id: "temp-" + Date.now(), // Temporary ID until DB write
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
      createdAt: new Date(),
      updatedAt: new Date(),
      addresses: addresses.map((address, index) => ({
        id: `temp-addr-${index}`,
        churchId: "temp",
        street1: address.street_1 ?? null,
        street2: address.street_2 ?? null,
        city: address.city ?? null,
        state: address.state ?? null,
        postCode: address.post_code ?? null,
        latitude: null, // Will be geocoded in background
        longitude: null,
        sourceUrl: address.source_url ?? null,
        isPrimary: index === 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      serviceTimes: serviceTimes.map((label, index) => ({
        id: `temp-service-${index}`,
        churchId: "temp",
        label,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      evaluations: [
        {
          id: `temp-eval-${Date.now()}`,
          churchId: "temp",
          rawEvaluation: evaluationData.rawEvaluation,
          badges: evaluationData.badges,
          secondary: evaluationData.secondary as Prisma.JsonValue,
          tertiary: evaluationData.tertiary as Prisma.JsonValue,
          coreOnSiteCount: evaluationData.coreOnSiteCount,
          coreTotalCount: evaluationData.coreTotalCount,
          coverageRatio: evaluationData.coverageRatio,
          status: evaluationData.status,
          coreTrinity: evaluationData.coreTrinity,
          coreGospel: evaluationData.coreGospel,
          coreJustificationByFaith: evaluationData.coreJustificationByFaith,
          coreChristDeityHumanity: evaluationData.coreChristDeityHumanity,
          coreScriptureAuthority: evaluationData.coreScriptureAuthority,
          coreIncarnationVirginBirth: evaluationData.coreIncarnationVirginBirth,
          coreAtonementNecessary: evaluationData.coreAtonementNecessary,
          coreResurrectionOfJesus: evaluationData.coreResurrectionOfJesus,
          coreReturnAndJudgment: evaluationData.coreReturnAndJudgment,
          coreCharacterOfGod: evaluationData.coreCharacterOfGod,
          createdAt: new Date(),
        },
      ],
    });

    // Return immediately to user (geocoding happens in background)
    const response = NextResponse.json(immediateDetail);

    // ============================================================================
    // Background Job: Geocode + Persist to Database (Fire-and-Forget)
    // ============================================================================
    void (async () => {
      try {
        console.log(`[Background] Starting geocoding for ${websiteUrl}`);

        // Geocode all addresses in parallel
        const geocodedAddresses = await Promise.all(
          addresses.map((address, index) =>
            geocodeAddress({
              street1: address.street_1,
              city: address.city,
              state: address.state,
              postCode: address.post_code,
            }).then((coords) => ({ index, coords }))
          )
        );

        console.log(`[Background] Geocoding complete, saving to database...`);

        await prisma.$transaction(async (tx) => {
          const existing = await tx.church.findUnique({ where: { website: websiteUrl }, select: { id: true } });

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

          const churchId = existing
            ? existing.id
            : (await tx.church.create({ data: baseData })).id;

          if (existing) {
            await tx.church.update({ where: { id: churchId }, data: baseData });
          }

          await tx.churchAddress.deleteMany({ where: { churchId } });
          await tx.churchServiceTime.deleteMany({ where: { churchId } });

          await Promise.all(
            addresses.map((address, index) => {
              const coords = geocodedAddresses.find((entry) => entry.index === index)?.coords ?? {
                latitude: null,
                longitude: null,
              };
              return tx.churchAddress.create({
                data: {
                  churchId,
                  street1: address.street_1 ?? null,
                  street2: address.street_2 ?? null,
                  city: address.city ?? null,
                  state: address.state ?? null,
                  postCode: address.post_code ?? null,
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  sourceUrl: address.source_url ?? null,
                  isPrimary: index === 0,
                },
              });
            })
          );

          await Promise.all(
            serviceTimes.map((label) =>
              tx.churchServiceTime.create({
                data: {
                  churchId,
                  label,
                },
              })
            )
          );

          await tx.churchEvaluation.create({
            data: {
              churchId,
              ...evaluationData,
            },
          });

        });

        console.log(`[Background] Database write complete for ${websiteUrl}`);
      } catch (error) {
        console.error(`[Background] Failed to persist church ${websiteUrl}:`, error);
        // Background job failure doesn't affect user experience
        // Could implement retry logic or logging service here
      }
    })();

    return response;
  } catch (error) {
    console.error("Failed to evaluate church", error);

    const errorMessage = error instanceof Error ? error.message : "Unable to evaluate church at this time";

    // Provide more specific error messages
    if (errorMessage.includes("Unable to gather website content")) {
      return NextResponse.json(
        {
          error: "Could not access the church website. The site may be blocking crawlers, offline, or require authentication. Please verify the URL and try again."
        },
        { status: 422 }
      );
    }

    if (errorMessage.includes("TAVILY_API_KEY")) {
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 });
    }

    if (errorMessage.includes("OPENAI_API_KEY")) {
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 });
    }

    return NextResponse.json(
      { error: errorMessage.length < 200 ? errorMessage : "Unable to evaluate church at this time" },
      { status: 500 }
    );
  }
}
